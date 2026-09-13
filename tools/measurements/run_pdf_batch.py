#!/usr/bin/env python3
"""Run the authorized strict-PDF corpus measurement twice, without state changes."""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import subprocess
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

COLLECTOR_DIR = Path(__file__).resolve().parents[2] / "workers" / "collector"
sys.path.insert(0, str(COLLECTOR_DIR))

from pdf_parser_runner import git_value, run_file  # noqa: E402

OUTCOMES = (
    "SUCCESS",
    "NO_EXTRACTABLE_TEXT",
    "ENCRYPTED",
    "EXTRACTION_FAILED",
    "INPUT_INTEGRITY_MISMATCH",
)
METRICS = (
    "page_count",
    "extracted_char_count",
    "replacement_char_ratio",
    "hangul_ratio",
    "pages_with_text",
    "pages_without_text",
)
CONTRACT_KEYS = (
    "parser_name",
    "parser_version",
    "parser_engine",
    "parser_engine_version",
    "parser_source_sha256",
    "dependency_lock_hash",
    "runtime_manifest_sha256",
    "environment_fingerprint",
)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def metric_distribution(results: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    output = {}
    for metric in METRICS:
        values = [float(row["attempts"][0][metric]) for row in results]
        output[metric] = {
            "min": min(values),
            "p25": percentile(values, 0.25),
            "median": statistics.median(values),
            "p75": percentile(values, 0.75),
            "p95": percentile(values, 0.95),
            "max": max(values),
        }
    return output


def classify_outcome(attempt: dict[str, Any]) -> str:
    if attempt["failure_domain"] == "INPUT_INTEGRITY":
        return "INPUT_INTEGRITY_MISMATCH"
    return attempt["result"]


def runner_dirty() -> bool | None:
    try:
        result = subprocess.run(
            ["git", "diff", "--quiet", "HEAD", "--", str(Path(__file__).resolve())],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return result.returncode != 0
    except Exception:
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus-root", required=True, type=Path)
    parser.add_argument("--measurement", required=True, type=Path)
    parser.add_argument("--canary", required=True, type=Path)
    parser.add_argument("--lock-file", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    measurement = json.loads(args.measurement.read_text(encoding="utf-8"))
    items = [row for row in measurement["files"] if row["detected_magic"] == "PDF"]
    if len(items) != 1730 or measurement["strict_pdf_count"] != 1730:
        raise ValueError(f"strict PDF population must be 1,730, received {len(items)}")
    canary = json.loads(args.canary.read_text(encoding="utf-8"))
    if canary["result"] != "PASSED" or canary["canary_type"] != "PDF_CANARY":
        raise ValueError("a passed runtime-v1 PDF canary is required")
    canary_attempts = [attempt for row in canary["results"] for attempt in row["attempts"]]
    expected_lists = {key: sorted({attempt[key] for attempt in canary_attempts}) for key in CONTRACT_KEYS}
    if any(len(values) != 1 for values in expected_lists.values()):
        raise ValueError("canary parser/runtime contract is not singular")
    expected = {key: values[0] for key, values in expected_lists.items()}

    batch_run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)
    results: list[dict[str, Any]] = []
    for item in sorted(items, key=lambda row: row["relative_path"]):
        source = args.corpus_root / item["relative_path"]
        attempts = []
        for attempt_number in (1, 2):
            attempt = run_file(
                source,
                expected_sha256=item["sha256"],
                file_name=item["file_name"],
                evidence_as_of=item["collected_at_kst"],
                lock_path=args.lock_file,
                redact_roots=[args.corpus_root, Path.cwd()],
            )
            attempt["attempt_number"] = attempt_number
            attempts.append(attempt)
        deterministic = (
            attempts[0]["result"] == attempts[1]["result"]
            and attempts[0]["failure_domain"] == attempts[1]["failure_domain"]
            and attempts[0]["failure_code"] == attempts[1]["failure_code"]
            and attempts[0]["extract_hash"] == attempts[1]["extract_hash"]
            and attempts[0]["environment_fingerprint"] == attempts[1]["environment_fingerprint"]
            and all(attempts[0][metric] == attempts[1][metric] for metric in METRICS)
        )
        contract_mismatches = sorted({
            key
            for attempt in attempts
            for key, expected_value in expected.items()
            if attempt[key] != expected_value
        })
        results.append({
            "relative_path": item["relative_path"],
            "source_kind": item["source_kind"],
            "source_owner_id": item["source_owner_id"],
            "file_name": item["file_name"],
            "size_bytes": item["size_bytes"],
            "baseline_sha256": item["sha256"],
            "legacy_extraction_status": item["legacy_extraction_status"],
            "outcome": classify_outcome(attempts[0]),
            "deterministic": deterministic,
            "contract_mismatches": contract_mismatches,
            "attempts": attempts,
        })

    outcome_counts = Counter(row["outcome"] for row in results)
    failure_counts = Counter(
        f"{row['attempts'][0]['failure_domain']}/{row['attempts'][0]['failure_code']}"
        for row in results
        if row["attempts"][0]["failure_domain"]
    )
    integrity_mismatches = sum(
        row["outcome"] == "INPUT_INTEGRITY_MISMATCH"
        or row["attempts"][0]["input_sha256"] != row["baseline_sha256"]
        or row["attempts"][0]["detected_magic"] != "PDF"
        for row in results
    )
    runtime_mismatches = sum(bool(row["contract_mismatches"]) for row in results)
    nondeterministic = sum(not row["deterministic"] for row in results)
    code_dirty = runner_dirty()
    guardrails = []
    if integrity_mismatches:
        guardrails.append("INPUT_INTEGRITY_MISMATCH")
    if runtime_mismatches:
        guardrails.append("RUNTIME_OR_ENVIRONMENT_MISMATCH")
    if nondeterministic:
        guardrails.append("NONDETERMINISTIC_RESULT")
    if any(attempt["parser_code_dirty"] for row in results for attempt in row["attempts"]):
        guardrails.append("PARSER_CODE_DIRTY")
    if code_dirty is not False:
        guardrails.append("BATCH_RUNNER_CODE_DIRTY_OR_UNKNOWN")

    output = {
        "batch_run_id": batch_run_id,
        "batch_type": "PDF_FULL_CORPUS_MEASUREMENT",
        "provenance": "ACTUAL_EXECUTION",
        "authorization_basis": "USER_APPROVED_AFTER_RUNTIME_V1_REPRODUCTION",
        "canary_run_id": canary["canary_run_id"],
        "started_at": started_at.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "population_count": len(results),
        "attempt_count": len(results) * 2,
        "batch_runner_code_commit_sha": git_value(["rev-parse", "HEAD"]),
        "batch_runner_code_dirty": code_dirty,
        "batch_runner_source_sha256": sha256_file(Path(__file__)),
        "expected_parser_runtime_contract": expected,
        "source_hashes": {
            "measurement": sha256_file(args.measurement),
            "canary": sha256_file(args.canary),
            "dependency_lock": sha256_file(args.lock_file),
        },
        "outcome_counts": {name: outcome_counts[name] for name in OUTCOMES},
        "failure_domain_code_counts": dict(sorted(failure_counts.items())),
        "metric_distributions": metric_distribution(results),
        "nondeterministic_result_count": nondeterministic,
        "extract_hash_reproducibility_anomaly_count": sum(
            attempts[0]["extract_hash"] != attempts[1]["extract_hash"]
            for attempts in (row["attempts"] for row in results)
        ),
        "input_sha_or_magic_mismatch_count": integrity_mismatches,
        "runtime_environment_mismatch_count": runtime_mismatches,
        "guardrail_violations": guardrails,
        "quality_metrics_used_as_thresholds": False,
        "identity_evaluation_performed": False,
        "ocr_performed": False,
        "state_changes_performed": False,
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes((json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({
        "batch_run_id": batch_run_id,
        "population": len(results),
        "attempts": len(results) * 2,
        "outcomes": output["outcome_counts"],
        "failures": output["failure_domain_code_counts"],
        "nondeterministic": nondeterministic,
        "guardrail_violations": guardrails,
    }, ensure_ascii=False, indent=2))
    return 2 if guardrails else 0


if __name__ == "__main__":
    raise SystemExit(main())
