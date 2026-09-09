#!/usr/bin/env python3
"""Claim and run the ten-day KODIT collection job without publishing a release."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

JOB_CODE = "kodit-regulation-full-collection"
USER_AGENT = "KODIT-scheduled-collector/0.1"
ROOT = Path(__file__).resolve().parents[2]
REVIEW_CSV = ROOT / "apps" / "public-site" / "data" / "review-20260908" / "regulations.csv"
SOURCE_PAGES = {
    "kodit_preannouncement": [
        f"https://www.kodit.or.kr/kodit/na/ntt/selectNttList.do?mi=2812&bbsId=322&listCo=500&currPage={page}"
        for page in range(1, 6)
    ],
    "alio": ["https://www.alio.go.kr/item/itemOrganList.do?apbaId=C0091&reportFormRootNo=21110"],
    "kodit_product_business": [
        "https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11307&mi=2970",
        "https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11065&mi=2523",
    ],
}


def normalize_url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("absolute HTTP(S) URL required")
    query = urllib.parse.urlencode(sorted(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)))
    return urllib.parse.urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, query, ""))


def utc(value: str | None = None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("--now must include a timezone")
    return parsed.astimezone(timezone.utc)


class SupabaseRpc:
    def __init__(self, url: str, service_key: str):
        self.base = url.rstrip("/")
        self.key = service_key

    def call(self, function: str, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode()
        request = urllib.request.Request(
            f"{self.base}/rest/v1/rpc/{function}", data=body, method="POST",
            headers={
                "apikey": self.key, "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json", "Content-Profile": "api", "Accept-Profile": "api",
                "User-Agent": USER_AGENT,
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
        return json.loads(raw or b"null")


def fetch(url: str, limit: int = 50_000_000) -> tuple[bytes, dict]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read(limit + 1)
        if len(body) > limit:
            raise ValueError("response exceeds 50 MB")
        return body, {
            "status": response.status,
            "mime_type": response.headers.get_content_type(),
            "etag": response.headers.get("ETag", ""),
            "last_modified": response.headers.get("Last-Modified", ""),
            "final_url": normalize_url(response.geturl()),
            "content_disposition": response.headers.get("Content-Disposition", ""),
        }


def detected_format(body: bytes) -> str:
    if body.startswith(b"%PDF-"):
        return "pdf"
    if body.startswith(bytes.fromhex("d0cf11e0a1b11ae1")):
        return "hwp5"
    if body.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(body)) as archive:
                if "mimetype" in archive.namelist() and b"hwp" in archive.read("mimetype").lower():
                    return "hwpx"
        except zipfile.BadZipFile:
            pass
    return "unknown"


def document_anchors(body: bytes, fmt: str, name: str, revision: str) -> bool:
    text = ""
    if fmt == "pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(body))
        if reader.is_encrypted:
            raise ValueError("encrypted PDF")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    elif fmt == "hwpx":
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            text = " ".join(
                re.sub(r"<[^>]+>", " ", archive.read(item).decode("utf-8", "replace"))
                for item in archive.namelist() if item.startswith("Contents/section") and item.endswith(".xml")
            )
    else:
        return False
    compact = re.sub(r"\s+", "", text)
    name_ok = re.sub(r"\s+", "", name) in compact
    article_ok = bool(re.search(r"제\s*1\s*조", text))
    revision_ok = True
    if revision:
        parts = re.findall(r"\d+", revision)
        revision_ok = len(parts) >= 3 and bool(re.search(rf"{int(parts[0])}\s*[.년/-]\s*0?{int(parts[1])}\s*[.월/-]\s*0?{int(parts[2])}", text))
    return name_ok and article_ok and revision_ok


def load_targets() -> list[dict]:
    with REVIEW_CSV.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    targets = {}
    for row in rows:
        if not row["official_url"]:
            continue
        url = normalize_url(row["official_url"])
        targets.setdefault(url, {
            "url": url, "title": row["regulation_name"], "revision": row["revision_date"],
            "expected_sha256": row["document_sha256"],
        })
    return list(targets.values())


def collect_document(target: dict) -> dict:
    body, headers = fetch(target["url"])
    fmt = detected_format(body)
    if fmt == "unknown":
        raise ValueError("unsupported magic bytes")
    sha = hashlib.sha256(body).hexdigest()
    expected = target["expected_sha256"]
    changed = bool(expected and expected != sha)
    anchors = document_anchors(body, fmt, target["title"], target["revision"])
    # HWP/HWPX never become full-text-public from download or hash checks alone.
    verification = "anchors_confirmed" if anchors else "extraction_pending"
    return {
        "title": target["title"], "normalized_url": target["url"], "final_url": headers["final_url"],
        "sha256": sha, "content_length": len(body), "mime_type": headers["mime_type"],
        "detected_format": fmt, "http_status": headers["status"], "etag": headers["etag"],
        "last_modified": headers["last_modified"], "file_name": target["title"],
        "verification": verification, "changed": changed,
    }


def collect_all() -> dict:
    source_results, failures, observations = [], [], []
    for source, urls in SOURCE_PAGES.items():
        digests = []
        for url in urls:
            try:
                body, meta = fetch(url, 2_000_000)
                digests.append(hashlib.sha256(body).hexdigest())
                source_results.append({"source": source, "url": url, "status": "succeeded", "http_status": meta["status"]})
            except Exception as exc:  # source failures are isolated
                failures.append({"source": source, "url": url, "error": f"{type(exc).__name__}: {exc}"[:500]})
        source_results.append({"source": source, "digest": hashlib.sha256("".join(digests).encode()).hexdigest(), "successful_pages": len(digests)})

    targets = load_targets()
    with ThreadPoolExecutor(max_workers=8) as executor:
        pending = {executor.submit(collect_document, target): target for target in targets}
        for future in as_completed(pending):
            target = pending[future]
            try:
                observations.append(future.result())
            except Exception as exc:
                failures.append({"source": "direct_document", "url": target["url"], "error": f"{type(exc).__name__}: {exc}"[:500]})

    stable = {
        "sources": sorted(source_results, key=lambda item: (item["source"], item.get("url", ""))),
        "documents": sorted((item["normalized_url"], item["sha256"]) for item in observations),
    }
    fingerprint = hashlib.sha256(json.dumps(stable, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return {"fingerprint": fingerprint, "source_results": source_results, "failures": failures, "observations": observations}


def execute(rpc: SupabaseRpc, trigger: str, now: datetime, collector=collect_all) -> dict:
    timestamp = now.isoformat()
    claim_rows = rpc.call("claim_collection_run", {
        "p_job_code": JOB_CODE, "p_trigger_type": trigger,
        "p_scheduled_for": timestamp, "p_now": timestamp,
    })
    claim = claim_rows[0]
    if claim["outcome"] in {"not_due", "locked"}:
        return {"outcome": claim["outcome"], "run_id": claim.get("crawl_run_id"), "next_due_at": claim["next_due_at"]}

    run_id = claim["crawl_run_id"]
    try:
        result = collector()
        previous = claim.get("previous_fingerprint")
        changed = previous is None or previous != result["fingerprint"]
        changed_items = [item for item in result["observations"] if item["changed"]]
        if changed and not changed_items:
            changed_items = [{"title": "공식 수집경로 변경", "url": "https://www.kodit.or.kr"}]
        succeeded_sources = sum(1 for item in result["source_results"] if item.get("status") == "succeeded") + len(result["observations"])
        if succeeded_sources == 0:
            final_status = "failed"
        else:
            final_status = "succeeded" if changed else "no_change"
        complete = rpc.call("complete_collection_run", {
            "p_crawl_run_id": run_id, "p_status": final_status, "p_completed_at": utc().isoformat(),
            "p_collected_count": succeeded_sources, "p_changed_count": len(changed_items) if changed else 0,
            "p_failed_source_count": len(result["failures"]), "p_content_fingerprint": result["fingerprint"],
            "p_error_summary": json.dumps(result["failures"][:20], ensure_ascii=False),
            "p_observations": [{key: value for key, value in item.items() if key != "changed"} for item in result["observations"]],
            "p_queue_items": changed_items,
        })[0]
        return {"outcome": final_status, "run_id": run_id, "collected_count": succeeded_sources,
                "changed_count": len(changed_items) if changed else 0, "failed_source_count": len(result["failures"]),
                "draft_created": bool(complete.get("draft_release_id")), "next_due_at": complete["next_due_at"]}
    except Exception as exc:
        failure_fingerprint = hashlib.sha256(f"failed:{run_id}".encode()).hexdigest()
        rpc.call("complete_collection_run", {
            "p_crawl_run_id": run_id, "p_status": "failed", "p_completed_at": utc().isoformat(),
            "p_collected_count": 0, "p_changed_count": 0, "p_failed_source_count": 1,
            "p_content_fingerprint": failure_fingerprint, "p_error_summary": f"{type(exc).__name__}: {exc}"[:1000],
            "p_observations": [], "p_queue_items": [],
        })
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trigger", choices=("schedule", "manual"), required=True)
    parser.add_argument("--now", help="timezone-aware test clock; production workflow leaves this unset")
    args = parser.parse_args()
    url = os.environ.get("KODIT_SUPABASE_URL")
    key = os.environ.get("KODIT_SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("required Supabase collector credentials are not configured")
    result = execute(SupabaseRpc(url, key), args.trigger, utc(args.now))
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
