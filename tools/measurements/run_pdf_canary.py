#!/usr/bin/env python3
"""Run a separate two-pass canary for real strict-PDF corpus samples."""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

COLLECTOR_DIR = Path(__file__).resolve().parents[2] / "workers" / "collector"
sys.path.insert(0, str(COLLECTOR_DIR))

from pdf_parser_runner import run_file  # noqa: E402

OUTCOMES = ("SUCCESS", "NO_EXTRACTABLE_TEXT", "ENCRYPTED", "EXTRACTION_FAILED")
METRICS = (
    "page_count",
    "extracted_char_count",
    "replacement_char_ratio",
    "hangul_ratio",
    "pages_with_text",
    "pages_without_text",
)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def metric_summary(results: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    summary = {}
    for metric in METRICS:
        values = [float(row["attempts"][0][metric]) for row in results]
        summary[metric] = {
            "min": min(values),
            "median": statistics.median(values),
            "max": max(values),
        }
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--measurement", required=True, type=Path)
    parser.add_argument("--corpus-root", required=True, type=Path)
    parser.add_argument("--lock-file", required=True, type=Path)
    parser.add_argument("--runtime-manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    measurement = json.loads(args.measurement.read_text(encoding="utf-8"))
    runtime = json.loads(args.runtime_manifest.read_text(encoding="utf-8"))
    if plan["plan_type"] != "PDF_CANARY_PLAN" or not 10 <= len(plan["samples"]) <= 15:
        raise ValueError("PDF canary plan must contain 10 to 15 samples")
    measured = {row["relative_path"]: row for row in measurement["files"]}

    canary_run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)
    results = []
    for sample in plan["samples"]:
        baseline = measured.get(sample["relative_path"])
        if not baseline or baseline["detected_magic"] != "PDF":
            raise ValueError(f"sample is not strict PDF: {sample['relative_path']}")
        attempts = []
        for attempt_number in (1, 2):
            attempt = run_file(
                args.corpus_root / sample["relative_path"],
                expected_sha256=sample["sha256"],
                file_name=sample["file_name"],
                evidence_as_of=sample["collected_at_kst"],
                lock_path=args.lock_file,
                redact_roots=[args.corpus_root, Path.cwd()],
            )
            attempt["attempt_number"] = attempt_number
            attempts.append(attempt)
        same_metrics = all(
            attempts[0][metric] == attempts[1][metric] for metric in METRICS
        )
        reproducible = (
            attempts[0]["result"] == attempts[1]["result"]
            and attempts[0]["extract_hash"] == attempts[1]["extract_hash"]
            and attempts[0]["environment_fingerprint"]
            == attempts[1]["environment_fingerprint"]
            and attempts[0]["error_class"] == attempts[1]["error_class"]
            and attempts[0]["error_message"] == attempts[1]["error_message"]
            and same_metrics
        )
        classified = attempts[0]["result"] in OUTCOMES
        success_valid = (
            attempts[0]["result"] != "SUCCESS"
            or bool(attempts[0]["extract_hash"])
            and attempts[0]["extracted_char_count"] > 0
        )
        non_success_valid = (
            attempts[0]["result"] != "NO_EXTRACTABLE_TEXT"
            or attempts[0]["extracted_char_count"] == 0
        )
        failed_valid = (
            attempts[0]["result"] != "EXTRACTION_FAILED"
            or bool(attempts[0]["error_class"] and attempts[0]["full_stack_trace"])
        )
        passed = (
            all(attempt["input_sha256"] == sample["sha256"] for attempt in attempts)
            and all(attempt["detected_magic"] == "PDF" for attempt in attempts)
            and all(attempt["parser_code_dirty"] is False for attempt in attempts)
            and all(
                attempt["environment"]["runtime_contract_status"] == "SATISFIED"
                for attempt in attempts
            )
            and classified
            and success_valid
            and non_success_valid
            and failed_valid
            and reproducible
        )
        results.append({
            "relative_path": sample["relative_path"],
            "source_kind": sample["source_kind"],
            "source_owner_id": sample["source_owner_id"],
            "file_name": sample["file_name"],
            "size_bytes": sample["size_bytes"],
            "baseline_sha256": sample["sha256"],
            "year_tokens": sample["year_tokens"],
            "legacy_extraction_status": sample["legacy_extraction_status"],
            "reproducible": reproducible,
            "passed": passed,
            "attempts": attempts,
        })

    counts = Counter(row["attempts"][0]["result"] for row in results)
    fingerprints = {attempt["environment_fingerprint"] for row in results for attempt in row["attempts"]}
    runtime_matches = fingerprints == {runtime["environment_fingerprint"]}
    passed_count = sum(row["passed"] for row in results)
    output = {
        "canary_run_id": canary_run_id,
        "canary_type": "PDF_CANARY",
        "provenance": "ACTUAL_EXECUTION",
        "started_at": started_at.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "sample_count": len(results),
        "attempt_count": len(results) * 2,
        "passed_count": passed_count,
        "failed_count": len(results) - passed_count,
        "outcome_counts": {name: counts[name] for name in OUTCOMES},
        "quality_metric_summary": metric_summary(results),
        "environment_fingerprint_count": len(fingerprints),
        "runtime_manifest_matches": runtime_matches,
        "integrity_mismatch_count": sum(
            any(a["input_sha256"] != row["baseline_sha256"] for a in row["attempts"])
            for row in results
        ),
        "reproducibility_anomaly_count": sum(not row["reproducible"] for row in results),
        "parser_dirty_count": sum(
            bool(a["parser_code_dirty"]) for row in results for a in row["attempts"]
        ),
        "result": (
            "PASSED"
            if passed_count == len(results) and len(fingerprints) == 1 and runtime_matches
            else "FAILED"
        ),
        "full_batch_authorized": False,
        "source_hashes": {
            "plan": sha256_file(args.plan),
            "measurement": sha256_file(args.measurement),
            "runtime_manifest": sha256_file(args.runtime_manifest),
            "dependency_lock": sha256_file(args.lock_file),
        },
        "state_changes_performed": False,
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(
        (json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    )
    print(json.dumps({
        "canary_run_id": canary_run_id,
        "result": output["result"],
        "samples": len(results),
        "attempts": len(results) * 2,
        "outcomes": output["outcome_counts"],
        "reproducibility_anomalies": output["reproducibility_anomaly_count"],
    }, ensure_ascii=False, indent=2))
    return 0 if output["result"] == "PASSED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
