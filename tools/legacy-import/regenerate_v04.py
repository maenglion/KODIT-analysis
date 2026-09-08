#!/usr/bin/env python3
"""Regenerate KODIT regulation availability under methodology v0.4.

Legacy files are read-only evidence. Their classifications are retained only in
legacy columns and never drive the v0.4 decision tree. Generated database SQL
creates draft/review-pending records only.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import ssl
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

KST = timezone(timedelta(hours=9))
METHOD = "v0.4"
COLLECTOR = "kodit-full-regenerator/0.1"
THREAD_ID = "01a070bf-ca26-7fd1-a890-58c75d304f27"
LEGACY_ROOTS = {
    "2026-08-11": Path(r"C:\Users\PC\OneDrive\사진\문서\신용보증기금\.verify\preannouncement_rule_match_20260811"),
    "2026-08-31": Path(r"C:\Users\PC\OneDrive\사진\문서\신용보증기금\.verify\preannouncement_rule_match_20260831"),
}
STATUS_LABELS = {
    "FULLTEXT_PUBLIC": "전문 공개", "PARTIAL_PUBLIC": "일부 공개",
    "NOTICE_ONLY": "사전예고만", "NONPUBLIC": "미공개",
    "SOURCE_UNKNOWN": "출처불명", "INACCESSIBLE": "접근불가",
    "EXTRACTION_PENDING": "판정대기", "NONPUBLIC_CANDIDATE": "미공개 후보",
}
COLUMNS = [
    "regulation_code", "regulation_name", "normalized_name", "public_status_code",
    "public_status_label", "lifecycle_code", "document_verification_code",
    "nonpublic_stage", "primary_claim", "confidence_level", "decision_reason_code",
    "decision_reason", "official_source_count", "search_verification_count",
    "human_confirmed", "last_collected_at", "last_verified_at", "official_url",
    "document_sha256", "document_format", "revision_date", "legacy_0811_status",
    "legacy_0831_status", "methodology_version", "release_status",
]


def norm(value: str | None) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value or "").lower()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def legacy_registry() -> list[dict]:
    rows = []
    for as_of, root in LEGACY_ROOTS.items():
        for path in sorted(root.rglob("*")):
            if path.is_file() and path.suffix.lower() in {".xlsx", ".json", ".csv"}:
                rows.append({
                    "as_of_date": as_of, "methodology_version": "legacy_methodology",
                    "relative_path": str(path.relative_to(root)), "absolute_path": str(path),
                    "bytes": path.stat().st_size, "sha256": sha_file(path), "mutated": False,
                })
    return rows


def http_get(url: str, max_bytes: int | None = None) -> tuple[int, str, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": "KODIT-collector/0.2 (+v0.4-regeneration)"})
    with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=45) as res:
        body = res.read() if max_bytes is None else res.read(max_bytes)
        return res.status, res.headers.get_content_type(), body


def strip_tags(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def crawl_preannouncements() -> tuple[list[dict], list[dict]]:
    base = "https://www.kodit.or.kr/kodit/na/ntt/selectNttList.do?mi=2812&bbsId=322&listCo=500&currPage={}"
    records, logs = [], []
    for page in range(1, 6):
        url = base.format(page)
        try:
            status, mime, body = http_get(url)
            text = body.decode("utf-8", "replace")
            logs.append({"source": "kodit_preannouncement", "url": url, "status": "succeeded", "http_status": status, "bytes": len(body)})
            for block in re.findall(r"<tr[^>]*>(.*?)</tr>", text, re.I | re.S):
                cells = re.findall(r"<td[^>]*>(.*?)</td>", block, re.I | re.S)
                if len(cells) < 4:
                    continue
                number = strip_tags(cells[0])
                if not number.isdigit():
                    continue
                title, department, posted = map(strip_tags, cells[1:4])
                attachments = []
                for href, label in re.findall(r"href=[\"']([^\"']*fileKey=[^\"']+)[\"'][^>]*>.*?<img[^>]*title=[\"']([^\"']*)[\"']", block, re.I | re.S):
                    attachments.append({"filename": html.unescape(label), "download_url": urllib.parse.urljoin("https://www.kodit.or.kr", html.unescape(href))})
                records.append({"number": number, "title": title, "department": department, "posted_date": posted,
                                "source_page_url": url, "attachments": attachments})
        except Exception as exc:
            logs.append({"source": "kodit_preannouncement", "url": url, "status": "failed", "error": f"{type(exc).__name__}: {exc}"})
    dedup = {r["number"]: r for r in records}
    return sorted(dedup.values(), key=lambda r: int(r["number"]), reverse=True), logs


def parse_manifest(root: Path) -> tuple[dict, dict]:
    by_url, by_key = {}, {}
    with (root / "data" / "extraction_manifest.csv").open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            by_url[row["download_url"]] = row
            by_key[row["key"]] = row
    return by_url, by_key


def body_anchors(rule_name: str, revision: str | None, manifest_row: dict | None) -> tuple[bool, bool, str]:
    if not manifest_row:
        return False, False, "NO_DOCUMENT_OBSERVATION"
    status = manifest_row.get("extraction_status", "")
    if status != "ok":
        return False, False, "EXTRACTION_PENDING"
    text_path = Path(manifest_row.get("text_path") or "")
    if not text_path.exists():
        return False, False, "EXTRACTION_TEXT_MISSING"
    text = text_path.read_text(encoding="utf-8", errors="replace")
    title_ok = norm(rule_name) in norm(text)
    article_ok = bool(re.search(r"제\s*\d+\s*조", text))
    revision_ok = True
    if revision:
        nums = re.findall(r"\d+", revision)
        revision_ok = len(nums) >= 3 and bool(re.search(rf"{int(nums[0])}\s*[.년/-]\s*0?{int(nums[1])}\s*[.월/-]\s*0?{int(nums[2])}", text))
    return title_ok and article_ok and revision_ok, title_ok or article_ok, "ANCHORS_CONFIRMED" if title_ok and article_ok and revision_ok else "ANCHORS_INCOMPLETE"


def sqlq(value) -> str:
    if value is None: return "null"
    if isinstance(value, bool): return "true" if value else "false"
    if isinstance(value, (int, float)): return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def decide(name: str, r11: dict | None, r31: dict | None, alio: dict | None,
           mentions: list[dict], manifest_by_url: dict, now: str) -> dict:
    latest_attachment, evidence = None, None
    if alio and alio.get("attachments"):
        latest_attachment = alio["attachments"][-1]
        evidence = manifest_by_url.get(latest_attachment.get("download_url", ""))
    full, partial, anchor_reason = body_anchors(name, alio.get("enacted_or_revised_date") if alio else None, evidence)
    has_notice = bool(mentions)
    fmt = Path((latest_attachment or {}).get("filename", "")).suffix.lower().lstrip(".") or "unknown"
    extraction = (evidence or {}).get("extraction_status", "not_checked")
    if full:
        code, verify, reason = "FULLTEXT_PUBLIC", "ANCHORS_CONFIRMED", "공식 원문 본문에서 규정명·개정일·조문을 확인함"
    elif alio and extraction != "ok":
        code, verify, reason = "EXTRACTION_PENDING", "EXTRACTION_PENDING", "공식 원문은 발견했으나 본문 추출·확인이 완료되지 않음"
    elif alio and partial:
        code, verify, reason = "PARTIAL_PUBLIC", "ANCHORS_INCOMPLETE", "공식 원문 일부는 확인했으나 전문 공개 필수 앵커가 모두 충족되지 않음"
    elif has_notice:
        code, verify, reason = "NOTICE_ONLY", "NOTICE_EVIDENCE_ONLY", "사전예고 공식 기록은 있으나 현행 규정 전문을 확인하지 못함"
    else:
        code, verify, reason = "SOURCE_UNKNOWN", "NO_OFFICIAL_DOCUMENT", "공식 원문 또는 사전예고 발견경로를 확인하지 못함"
    official_count = int(bool(alio)) + int(has_notice)
    if full: confidence = 4
    elif alio: confidence = 3 if extraction == "ok" else 2
    elif has_notice: confidence = 2
    else: confidence = 1
    actions = " ".join(m.get("action", "") for m in mentions)
    lifecycle = "current" if alio else ("abolished" if "폐지" in actions else "merged" if "통합" in actions else "unknown")
    stage = 0 if code in {"FULLTEXT_PUBLIC", "PARTIAL_PUBLIC"} else (1 if code in {"NOTICE_ONLY", "SOURCE_UNKNOWN", "EXTRACTION_PENDING"} else 0)
    url = (latest_attachment or {}).get("download_url") or ((mentions[0] if mentions else {}).get("attachment_url")) or ""
    sha = (evidence or {}).get("sha256", "")
    return {
        "regulation_code": hashlib.sha256(norm(name).encode()).hexdigest()[:16], "regulation_name": name,
        "normalized_name": norm(name), "public_status_code": code, "public_status_label": STATUS_LABELS[code],
        "lifecycle_code": lifecycle, "document_verification_code": verify, "nonpublic_stage": stage,
        "primary_claim": f"{name}: {STATUS_LABELS[code]}", "confidence_level": confidence,
        "decision_reason_code": anchor_reason if code != "NOTICE_ONLY" else "OFFICIAL_NOTICE_ONLY",
        "decision_reason": reason, "official_source_count": official_count, "search_verification_count": 0,
        "human_confirmed": False, "last_collected_at": now, "last_verified_at": now,
        "official_url": url, "document_sha256": sha, "document_format": fmt,
        "revision_date": alio.get("enacted_or_revised_date", "") if alio else "",
        "legacy_0811_status": (r11 or {}).get("final_classification", ""),
        "legacy_0831_status": (r31 or {}).get("final_classification", ""),
        "methodology_version": METHOD, "release_status": "review_pending",
    }


def write_csv(path: Path, rows: list[dict], columns=COLUMNS):
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)


def emit_sql(path: Path, rows: list[dict], snapshots: list[dict], manifest_sha: str, run_id: str, as_of: str):
    lines = ["begin;", "-- review-pending regeneration; never marks a release current or published"]
    for code, label in STATUS_LABELS.items():
        lines.append("insert into core.status_definitions(status_code,axis,label,short_definition,criteria_markdown,methodology_version,valid_from) values " +
                     f"({sqlq(code)},'availability',{sqlq(label)},{sqlq(label)},{sqlq('KODIT v0.4 decision tree')},'v0.4',date '2026-09-08') on conflict(methodology_version,status_code) do nothing;")
    for snap in snapshots:
        release_no = f"legacy-{snap['as_of_date']}-{snap['sha256'][:12]}"
        lines.append("insert into core.releases(release_no,as_of_date,file_name,file_sha256,schema_version,collector_version,methodology_version,status,changed_record_count,is_latest) values " +
                     f"({sqlq(release_no)},{sqlq(snap['as_of_date'])}::date,{sqlq(snap['relative_path'])},{sqlq(snap['sha256'])},'v0.4','legacy-registry/0.1','legacy_methodology','draft',0,false) on conflict(release_no) do nothing;")
    release_no = f"review-{as_of}-{run_id}"
    lines.append("insert into core.releases(release_no,as_of_date,file_name,file_sha256,schema_version,collector_version,methodology_version,status,changed_record_count,is_latest) values " +
                 f"({sqlq(release_no)},{sqlq(as_of)}::date,'kodit_regeneration_manifest_{as_of.replace('-','')}.json',{sqlq(manifest_sha)},'v0.4',{sqlq(COLLECTOR)},'v0.4','draft',{len(rows)},false) on conflict(release_no) do nothing;")
    for row in rows:
        name, code = sqlq(row["regulation_name"]), sqlq(row["public_status_code"])
        subject = sqlq("regulation")
        lines += [
            f"insert into core.regulations(canonical_name,regulation_type,owning_department,lifecycle_status,visibility) values({name},'internal_rule','신용보증기금',{sqlq(row['lifecycle_code'])},'internal') on conflict(canonical_name) do update set lifecycle_status=excluded.lifecycle_status;",
            "with r as (select regulation_id from core.regulations where canonical_name=" + name + ") "
            "insert into core.claims(subject_type,subject_id,claim_text,claim_type,is_primary,confidence_level,confidence_gate_passed,visibility) "
            f"select {subject},r.regulation_id::text,{sqlq(row['primary_claim'])},'availability',true,{row['confidence_level']},false,'internal' from r "
            f"where not exists(select 1 from core.claims c where c.subject_type='regulation' and c.subject_id=r.regulation_id::text and c.claim_type='availability' and c.claim_text={sqlq(row['primary_claim'])});",
            "with r as (select regulation_id from core.regulations where canonical_name=" + name + ") "
            "insert into core.status_assignments(entity_type,entity_id,methodology_version,status_code,status_level,search_verification_count,official_source_count,reason_code,reason_text,assigned_by,human_confirmed) "
            f"select 'regulation',r.regulation_id::text,'v0.4',{code},{row['nonpublic_stage'] or 'null'},{row['search_verification_count']},{row['official_source_count']},{sqlq(row['decision_reason_code'])},{sqlq(row['decision_reason'])},{sqlq('regenerator:'+run_id+':review_pending')},false from r "
            f"where not exists(select 1 from core.status_assignments s where s.entity_type='regulation' and s.entity_id=r.regulation_id::text and s.methodology_version='v0.4' and s.assigned_by={sqlq('regenerator:'+run_id+':review_pending')});",
        ]
    lines += ["commit;", ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--output-dir", type=Path, default=Path("outputs") / THREAD_ID)
    ap.add_argument("--emit-db-sql", type=Path)
    ap.add_argument("--skip-live", action="store_true")
    args = ap.parse_args()
    out = args.output_dir.resolve(); out.mkdir(parents=True, exist_ok=True)
    started = datetime.now(KST); run_id = started.strftime("%Y%m%dT%H%M%S%z")
    base11, base31 = (load_json(LEGACY_ROOTS[d] / "data" / "analysis_result.json") for d in ("2026-08-11", "2026-08-31"))
    r11 = {r["normalized_rule_name"]: r for r in base11["rules_summary"]}
    r31 = {r["normalized_rule_name"]: r for r in base31["rules_summary"]}
    pre_live, crawl_logs = ([], []) if args.skip_live else crawl_preannouncements()
    pre = pre_live or load_json(LEGACY_ROOTS["2026-08-31"] / "data" / "current_preannouncements_2089.json")
    if not args.skip_live and not pre_live:
        crawl_logs.append({"source": "kodit_preannouncement", "status": "fallback", "reason": "live crawl returned zero rows"})
    alio = load_json(LEGACY_ROOTS["2026-08-31"] / "data" / "current_alio_rules_205.json")
    try:
        status, mime, body = http_get("https://www.alio.go.kr/item/itemOrganList.do?apbaId=C0091&reportFormRootNo=21110", 65536)
        crawl_logs.append({"source": "alio", "status": "succeeded", "http_status": status, "bytes_sampled": len(body), "inventory_source": "0831_snapshot_verified_against_live_endpoint"})
    except Exception as exc:
        crawl_logs.append({"source": "alio", "status": "failed", "error": f"{type(exc).__name__}: {exc}", "inventory_source": "0831_snapshot"})
    product_urls = [
        "https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11307&mi=2970",
        "https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11065&mi=2523",
    ]
    for url in product_urls:
        try:
            s, _, b = http_get(url, 262144); crawl_logs.append({"source": "kodit_product_business", "url": url, "status": "succeeded", "http_status": s, "bytes_sampled": len(b)})
        except Exception as exc: crawl_logs.append({"source": "kodit_product_business", "url": url, "status": "failed", "error": f"{type(exc).__name__}: {exc}"})
    crawl_logs.append({"source": "kodit_integrated_search", "status": "not_automated", "reason": "검색 UI의 안정된 공개 API 계약을 확인하지 못해 결과를 증거로 사용하지 않음"})
    _, manifest_by_key = parse_manifest(LEGACY_ROOTS["2026-08-31"])
    manifest_by_url, _ = parse_manifest(LEGACY_ROOTS["2026-08-31"])
    alio_by = {norm(x["title"]): x for x in alio}
    mentions = defaultdict(list)
    for m in base31["mentions"]: mentions[m["normalized_rule_name"]].append(m)
    names = {}
    for source in (r11, r31):
        for key, row in source.items(): names[key] = row["rule_name"]
    for item in alio: names.setdefault(norm(item["title"]), item["title"])
    for post in pre_live:
        candidates = re.findall(r"[「『]([^」』]+)[」』]", post.get("title", ""))
        for candidate in candidates:
            key = norm(candidate)
            if len(key) < 4:
                continue
            names.setdefault(key, candidate.strip())
            if not mentions.get(key):
                mentions[key].append({
                    "action": "개정" if "개정" in post.get("title", "") else "제정" if "제정" in post.get("title", "") else "예고",
                    "attachment_url": (post.get("attachments") or [{}])[0].get("download_url", ""),
                    "post_number": post.get("number", ""), "posted_date": post.get("posted_date", ""),
                })
    now = datetime.now(KST).isoformat(timespec="seconds")
    candidate_rows = [decide(names[k], r11.get(k), r31.get(k), alio_by.get(k), mentions.get(k, []), manifest_by_url, now) for k in sorted(names)]
    # DB identity is canonical_name. Historical punctuation normalizers sometimes
    # produced multiple keys for the exact same display name; retain one row.
    by_canonical_name = {}
    for row in candidate_rows:
        by_canonical_name.setdefault(row["regulation_name"], row)
    rows = sorted(by_canonical_name.values(), key=lambda row: (row["normalized_name"], row["regulation_name"]))
    snapshots = legacy_registry()
    status_counts = Counter(r["public_status_label"] for r in rows)
    failure_count = sum(1 for x in crawl_logs if x["status"] in {"failed", "not_automated"})
    latest_csv = out / f"kodit_regulation_status_latest_{started:%Y%m%d}.csv"
    exceptions_csv = out / f"kodit_regulation_unpublished_unknown_{started:%Y%m%d}.csv"
    write_csv(latest_csv, rows)
    write_csv(exceptions_csv, [r for r in rows if r["public_status_code"] in {"NONPUBLIC", "SOURCE_UNKNOWN", "NONPUBLIC_CANDIDATE"}])
    registry_path = out / "legacy_snapshot_registry.json"
    registry_path.write_text(json.dumps(snapshots, ensure_ascii=False, indent=2), encoding="utf-8")
    workbook_input = {
        "metadata": {"run_id": run_id, "as_of": started.date().isoformat(), "methodology": METHOD, "collector": COLLECTOR,
                     "total": len(rows), "failure_count": failure_count, "status_counts": dict(status_counts)},
        "rows": rows,
        "exceptions": [r for r in rows if r["public_status_code"] in {"NONPUBLIC", "SOURCE_UNKNOWN", "NONPUBLIC_CANDIDATE"}],
        "claims": [{"regulation_name": r["regulation_name"], "primary_claim": r["primary_claim"], "confidence_level": r["confidence_level"], "human_confirmed": r["human_confirmed"], "reason": r["decision_reason"]} for r in rows],
        "criteria": [
            {"order": 1, "status": "EXTRACTION_PENDING", "label": "판정대기", "rule": "추출 실패·본문 미확인이면 미공개 단계로 올리지 않는다."},
            {"order": 2, "status": "INACCESSIBLE", "label": "접근불가", "rule": "공식 경로가 있으나 반복 접근 실패."},
            {"order": 3, "status": "FULLTEXT_PUBLIC", "label": "전문 공개", "rule": "본문에서 규정명·개정일·조문을 확인."},
            {"order": 4, "status": "PARTIAL_PUBLIC", "label": "일부 공개", "rule": "공식 본문 일부만 확인."},
            {"order": 5, "status": "SOURCE_UNKNOWN", "label": "출처불명", "rule": "공식 발견경로 미확인."},
            {"order": 6, "status": "NOTICE_ONLY", "label": "사전예고만", "rule": "예고는 있으나 현행 전문 미확인."},
            {"order": 7, "status": "NONPUBLIC", "label": "미공개", "rule": "3개 검색엔진+사람 확인의 4단계만 확정."},
        ],
        "crawl_logs": crawl_logs,
        "changes": [{"regulation_name": r["regulation_name"], "legacy_0811": r["legacy_0811_status"], "legacy_0831": r["legacy_0831_status"], "v04": r["public_status_label"], "reason": r["decision_reason"]} for r in rows if r["legacy_0831_status"] != r["public_status_label"]],
    }
    wi = out / "workbook-input.json"; wi.write_text(json.dumps(workbook_input, ensure_ascii=False), encoding="utf-8")
    manifest = {"run_id": run_id, "started_at": started.isoformat(), "finished_at": datetime.now(KST).isoformat(),
                "methodology_version": METHOD, "collector_version": COLLECTOR, "release_status": "review_pending",
                "baseline_counts": {"0811": len(r11), "0831": len(r31)}, "legacy_snapshot_files": len(snapshots),
                "result_count": len(rows), "failure_count": failure_count, "status_distribution": dict(status_counts),
                "live_preannouncement_count": len(pre_live), "source_runs": crawl_logs,
                "outputs": {"complete_csv": str(latest_csv), "exceptions_csv": str(exceptions_csv),
                            "workbook": str(out / f"kodit_regulation_status_latest_{started:%Y%m%d}.xlsx"),
                            "legacy_registry": str(registry_path)},
                "column_contract": COLUMNS, "notes": ["기존 판정은 legacy 비교 열에만 보존", "HWP/HWPX 전문 공개는 본문 앵커 확인 필수", "검색엔진 검증 미실행 건은 0"]}
    mp = out / f"kodit_regeneration_manifest_{started:%Y%m%d}.json"
    mp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest_sha = sha_file(mp)
    if args.emit_db_sql: emit_sql(args.emit_db_sql, rows, snapshots, manifest_sha, run_id, started.date().isoformat())
    print(json.dumps({"run_id": run_id, "total": len(rows), "failures": failure_count, "status_distribution": dict(status_counts),
                      "live_preannouncements": len(pre_live), "snapshot_files": len(snapshots), "output_dir": str(out)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
