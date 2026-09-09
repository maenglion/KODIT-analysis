#!/usr/bin/env python3
"""Stage a bundled review CSV into a non-latest draft release snapshot."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path


def rpc(name: str, payload: dict) -> object:
    base_url = os.environ.get("KODIT_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("KODIT_SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not key:
        raise RuntimeError("Supabase server credentials are not configured")
    request = urllib.request.Request(
        f"{base_url}/rest/v1/rpc/{name}", data=json.dumps(payload).encode("utf-8"), method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Content-Profile": "api", "Accept-Profile": "api"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"staging RPC rejected ({error.code}): {detail[:500]}") from error


def load_rows(csv_path: Path) -> list[dict]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    keep = {
        "regulation_code", "regulation_name", "normalized_name", "public_status_code", "public_status_label",
        "lifecycle_code", "document_verification_code", "nonpublic_stage", "primary_claim", "confidence_level",
        "decision_reason_code", "decision_reason", "official_source_count", "search_verification_count",
        "human_confirmed", "last_collected_at", "last_verified_at", "official_url", "document_sha256",
        "document_format", "revision_date", "methodology_version",
    }
    for row in rows:
        row["nonpublic_stage"] = int(row["nonpublic_stage"] or 0)
        row["confidence_level"] = int(row["confidence_level"])
        row["official_source_count"] = int(row["official_source_count"] or 0)
        row["search_verification_count"] = int(row["search_verification_count"] or 0)
        row["human_confirmed"] = row["human_confirmed"].lower() == "true"
    return [{key: row.get(key, "") for key in keep} for row in rows]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--release-id")
    parser.add_argument("--as-of", default="2026-09-08")
    parser.add_argument("--collector-version", default="kodit-full-regenerator/0.1")
    parser.add_argument("--methodology-version", default="v0.4")
    args = parser.parse_args()
    rows = load_rows(args.csv)
    source_sha256 = hashlib.sha256(args.csv.read_bytes()).hexdigest()
    release_id = args.release_id
    if not release_id:
        candidates = rpc("draft_regulation_release_candidates", {})
        matches = [item for item in candidates if item["as_of_date"] == args.as_of and item["collector_version"] == args.collector_version and item["methodology_version"] == args.methodology_version]
        if len(matches) != 1:
            raise RuntimeError(f"expected one matching draft release, found {len(matches)}")
        release_id = matches[0]["release_id"]
    rpc("register_draft_regulation_snapshot", {
        "p_release_id": release_id, "p_source_file_name": args.csv.name,
        "p_source_sha256": source_sha256, "p_source_row_count": len(rows),
    })
    affected = 0
    for offset in range(0, len(rows), 200):
        affected += int(rpc("upsert_draft_regulation_rows", {"p_release_id": release_id, "p_rows": rows[offset:offset + 200]}))
    verified = [item for item in rpc("draft_regulation_release_candidates", {}) if item["release_id"] == release_id]
    if len(verified) != 1 or int(verified[0]["row_count"]) != len(rows):
        raise RuntimeError("remote draft snapshot row count differs from source CSV")
    print(json.dumps({
        "release_id": release_id, "release_status": "draft", "is_latest": False,
        "source_rows": len(rows), "stored_rows": int(verified[0]["row_count"]),
        "source_sha256": source_sha256, "affected_rows": affected,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
