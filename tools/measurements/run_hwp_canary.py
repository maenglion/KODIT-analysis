#!/usr/bin/env python3
"""Select and execute a stratified, two-pass HWP canary without DB writes."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

COLLECTOR_DIR = Path(__file__).resolve().parents[2] / "workers" / "collector"
sys.path.insert(0, str(COLLECTOR_DIR))

from hwp_parser_runner import run_file  # noqa: E402


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pick_quantiles(rows: list[dict[str, Any]], count: int) -> list[dict[str, Any]]:
    ordered = sorted(rows, key=lambda row: int(row["content_length"]))
    if len(ordered) < count:
        raise ValueError(f"population {len(ordered)} is smaller than requested sample {count}")
    positions = [round(index * (len(ordered) - 1) / (count - 1)) for index in range(count)]
    picked: list[dict[str, Any]] = []
    used: set[str] = set()
    for position in positions:
        for offset in range(len(ordered)):
            candidate = ordered[min(len(ordered) - 1, position + offset)]
            if candidate["source_url"] not in used:
                picked.append(candidate)
                used.add(candidate["source_url"])
                break
    if len(picked) != count:
        raise AssertionError("could not select unique quantile samples")
    return picked


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--items", required=True, type=Path)
    parser.add_argument("--extraction-manifest", required=True, type=Path)
    parser.add_argument("--release-manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--lock-file", required=True, type=Path)
    parser.add_argument("--sample-count", type=int, default=15)
    parser.add_argument("--unknown-count", type=int, default=3)
    args = parser.parse_args()

    if args.sample_count < 10 or args.sample_count > 20:
        raise ValueError("canary sample-count must be between 10 and 20")
    if args.unknown_count < 1 or args.unknown_count >= args.sample_count:
        raise ValueError("unknown-count must be within the canary population")

    items = read_csv(args.items)
    observations = read_csv(args.extraction_manifest)
    release_manifest = json.loads(args.release_manifest.read_text(encoding="utf-8"))
    observation_by_url = {row["download_url"]: row for row in observations}

    unknown = [row for row in items if row["notice_evidence_status"] == "UNKNOWN"]
    verified = [row for row in items if row["notice_evidence_status"] == "VERIFIED_EXISTS"]
    selected_unknown = pick_quantiles(unknown, args.unknown_count)
    selected_verified = pick_quantiles(verified, args.sample_count - args.unknown_count)
    selected = [
        *(dict(row, selection_stratum="NOTICE_UNKNOWN") for row in selected_unknown),
        *(dict(row, selection_stratum="NOTICE_VERIFIED") for row in selected_verified),
    ]
    if len({row["source_url"] for row in selected}) != args.sample_count:
        raise AssertionError("canary URLs must be unique")

    canary_run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)
    results: list[dict[str, Any]] = []
    for item in selected:
        observed = observation_by_url.get(item["source_url"])
        if not observed:
            raise ValueError(f"missing extraction observation for {item['regulation_code']}")
        source = Path(observed["path"])
        attempts = []
        for attempt_number in (1, 2):
            record = run_file(
                source,
                expected_sha256=item["document_sha256"],
                file_name=observed["filename"],
                regulation_name=item["regulation_name"],
                aliases=[],
                evidence_as_of=release_manifest["finished_at"],
                lock_path=args.lock_file,
                redact_roots=[source.parent, Path.cwd()],
            )
            record["attempt_number"] = attempt_number
            attempts.append(record)
        reproducible = (
            attempts[0]["result"] == "SUCCESS"
            and attempts[1]["result"] == "SUCCESS"
            and attempts[0]["extract_hash"] == attempts[1]["extract_hash"]
            and attempts[0]["environment_fingerprint"] == attempts[1]["environment_fingerprint"]
        )
        passed = (
            attempts[0]["input_sha256"] == item["document_sha256"]
            and attempts[1]["input_sha256"] == item["document_sha256"]
            and attempts[0]["detected_magic"] == "OLE_HWP"
            and attempts[1]["detected_magic"] == "OLE_HWP"
            and attempts[0]["extracted_char_count"] > 0
            and attempts[1]["extracted_char_count"] > 0
            and attempts[0]["identity_matched"]
            and attempts[1]["identity_matched"]
            and reproducible
        )
        results.append(
            {
                "regulation_code": item["regulation_code"],
                "regulation_name": item["regulation_name"],
                "selection_stratum": item["selection_stratum"],
                "notice_evidence_status": item["notice_evidence_status"],
                "source_kind": observed["kind"],
                "source_owner_id": observed["owner_id"],
                "source_url": item["source_url"],
                "file_name": observed["filename"],
                "content_length": int(item["content_length"]),
                "baseline_sha256": item["document_sha256"],
                "attempts": attempts,
                "reproducible": reproducible,
                "passed": passed,
            }
        )

    finished_at = datetime.now(timezone.utc)
    passed_count = sum(1 for row in results if row["passed"])
    output = {
        "canary_run_id": canary_run_id,
        "provenance": "ACTUAL_EXECUTION",
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "evidence_as_of": release_manifest["finished_at"],
        "selection_contract": {
            "population": len(items),
            "sample_count": args.sample_count,
            "notice_unknown_count": args.unknown_count,
            "notice_verified_count": args.sample_count - args.unknown_count,
            "method": "size quantiles within notice-evidence strata; unique source URL",
        },
        "source_hashes": {
            "measurement_items": file_sha256(args.items),
            "extraction_manifest": file_sha256(args.extraction_manifest),
            "release_manifest": file_sha256(args.release_manifest),
            "dependency_lock": file_sha256(args.lock_file),
        },
        "result": "PASSED" if passed_count == args.sample_count else "FAILED",
        "passed_count": passed_count,
        "failed_count": args.sample_count - passed_count,
        "full_batch_authorized": passed_count == args.sample_count,
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "canary_run_id": canary_run_id,
        "result": output["result"],
        "passed": passed_count,
        "failed": args.sample_count - passed_count,
        "full_batch_authorized": output["full_batch_authorized"],
    }, ensure_ascii=False, indent=2))
    return 0 if output["result"] == "PASSED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
