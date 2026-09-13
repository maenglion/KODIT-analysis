#!/usr/bin/env python3
"""Run a separate two-pass canary for real HWPX corpus samples."""

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

from hwpx_parser_runner import run_file  # noqa: E402


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--corpus-root", required=True, type=Path)
    parser.add_argument("--corpus-measurement", required=True, type=Path)
    parser.add_argument("--extraction-manifest", required=True, type=Path)
    parser.add_argument("--lock-file", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    corpus = json.loads(args.corpus_measurement.read_text(encoding="utf-8"))
    observations = read_csv(args.extraction_manifest)
    corpus_by_path = {row["relative_path"]: row for row in corpus["files"]}
    observation_by_sha = {row["sha256"]: row for row in observations if row["sha256"]}
    samples = plan["samples"]
    if len(samples) < 3 or len(samples) > 5:
        raise ValueError("real HWPX canary must contain 3 to 5 samples")

    canary_run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)
    results: list[dict[str, Any]] = []
    for sample in samples:
        measured = corpus_by_path.get(sample["relative_path"])
        if not measured or measured["detected_magic"] != "ZIP_HWPX":
            raise ValueError(f"sample is not strict ZIP_HWPX: {sample['relative_path']}")
        if measured["sha256"] != sample["expected_sha256"]:
            raise ValueError(f"measurement SHA mismatch: {sample['relative_path']}")
        observed = observation_by_sha.get(sample["expected_sha256"])
        if not observed:
            raise ValueError(f"missing source observation: {sample['relative_path']}")
        path = args.corpus_root / sample["relative_path"]
        attempts = []
        for attempt_number in (1, 2):
            attempt = run_file(
                path,
                expected_sha256=sample["expected_sha256"],
                file_name=sample["file_name"],
                regulation_name=sample["regulation_name"],
                aliases=sample.get("aliases", []),
                evidence_as_of=observed["collected_at_kst"],
                lock_path=args.lock_file,
                redact_roots=[args.corpus_root, Path.cwd()],
            )
            attempt["attempt_number"] = attempt_number
            attempts.append(attempt)
        reproducible = (
            attempts[0]["result"] == attempts[1]["result"]
            and attempts[0]["extract_hash"] == attempts[1]["extract_hash"]
            and attempts[0]["environment_fingerprint"] == attempts[1]["environment_fingerprint"]
        )
        passed = (
            all(attempt["input_sha256"] == sample["expected_sha256"] for attempt in attempts)
            and all(attempt["detected_magic"] == "ZIP_HWPX" for attempt in attempts)
            and all(attempt["result"] == "SUCCESS" for attempt in attempts)
            and all(attempt["identity_matched"] for attempt in attempts)
            and all(attempt["extracted_char_count"] > 0 for attempt in attempts)
            and all(attempt["parser_code_dirty"] is False for attempt in attempts)
            and reproducible
        )
        results.append({
            "source_kind": sample["source_kind"],
            "source_owner_id": sample["source_owner_id"],
            "relative_path": sample["relative_path"],
            "file_name": sample["file_name"],
            "regulation_name": sample["regulation_name"],
            "baseline_sha256": sample["expected_sha256"],
            "size_bytes": measured["size_bytes"],
            "section_count": measured["section_count"],
            "reproducible": reproducible,
            "passed": passed,
            "attempts": attempts,
        })

    passed_count = sum(row["passed"] for row in results)
    fingerprints = sorted({
        attempt["environment_fingerprint"]
        for row in results
        for attempt in row["attempts"]
    })
    finished_at = datetime.now(timezone.utc)
    output = {
        "canary_run_id": canary_run_id,
        "canary_type": "HWPX_CANARY",
        "provenance": "ACTUAL_EXECUTION",
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "sample_count": len(results),
        "attempt_count": len(results) * 2,
        "passed_count": passed_count,
        "failed_count": len(results) - passed_count,
        "result": "PASSED" if passed_count == len(results) and len(fingerprints) == 1 else "FAILED",
        "full_batch_authorized": passed_count == len(results) and len(fingerprints) == 1,
        "environment_fingerprint_count": len(fingerprints),
        "source_hashes": {
            "plan": sha256_file(args.plan),
            "corpus_measurement": sha256_file(args.corpus_measurement),
            "extraction_manifest": sha256_file(args.extraction_manifest),
            "dependency_lock": sha256_file(args.lock_file),
        },
        "results": results,
        "state_changes_performed": False,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes((json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({
        "canary_run_id": canary_run_id,
        "type": output["canary_type"],
        "result": output["result"],
        "passed": passed_count,
        "failed": len(results) - passed_count,
    }, ensure_ascii=False, indent=2))
    return 0 if output["result"] == "PASSED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
