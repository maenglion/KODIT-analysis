#!/usr/bin/env python3
"""Reprocess all measured pending HWP files without changing database state."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

COLLECTOR_DIR = Path(__file__).resolve().parents[2] / "workers" / "collector"
sys.path.insert(0, str(COLLECTOR_DIR))

from hwp_parser_runner import run_file  # noqa: E402


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def classify(attempts: list[dict[str, Any]], baseline_sha256: str) -> str:
    if any(
        attempt["input_sha256"] != baseline_sha256
        or attempt["detected_magic"] != "OLE_HWP"
        for attempt in attempts
    ):
        return "INPUT_INTEGRITY_MISMATCH"
    if all(attempt["result"] == "SUCCESS" and attempt["identity_matched"] for attempt in attempts):
        return "PARSE_OK_AND_IDENTIFIED"
    if all(attempt["result"] == "IDENTITY_NOT_FOUND" for attempt in attempts):
        return "PARSE_OK_IDENTITY_UNRESOLVED"
    return "PARSE_FAILED"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--items", required=True, type=Path)
    parser.add_argument("--extraction-manifest", required=True, type=Path)
    parser.add_argument("--release-manifest", required=True, type=Path)
    parser.add_argument("--canary", required=True, type=Path)
    parser.add_argument("--lock-file", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    items = read_csv(args.items)
    if len(items) != 182:
        raise ValueError(f"batch population must be 182, received {len(items)}")
    observations = read_csv(args.extraction_manifest)
    observation_by_url = {row["download_url"]: row for row in observations}
    release_manifest = json.loads(args.release_manifest.read_text(encoding="utf-8"))
    canary = json.loads(args.canary.read_text(encoding="utf-8"))
    if canary["result"] != "PASSED" or not canary["full_batch_authorized"]:
        raise ValueError("a passed canary is required")
    canary_attempts = [
        attempt for row in canary["results"] for attempt in row["attempts"]
    ]
    expected = {
        key: sorted({attempt[key] for attempt in canary_attempts})
        for key in (
            "parser_name",
            "parser_version",
            "parser_engine",
            "parser_engine_version",
            "parser_source_sha256",
            "dependency_lock_hash",
            "environment_fingerprint",
        )
    }
    if any(len(values) != 1 for values in expected.values()):
        raise ValueError("canary parser/environment contract is not singular")
    expected = {key: values[0] for key, values in expected.items()}

    batch_run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)
    results: list[dict[str, Any]] = []
    for item in items:
        observed = observation_by_url.get(item["source_url"])
        if not observed:
            raise ValueError(f"missing extraction observation for {item['regulation_code']}")
        source = Path(observed["path"])
        attempts = []
        for attempt_number in (1, 2):
            attempt = run_file(
                source,
                expected_sha256=item["document_sha256"],
                file_name=observed["filename"],
                regulation_name=item["regulation_name"],
                aliases=[],
                evidence_as_of=release_manifest["finished_at"],
                lock_path=args.lock_file,
                redact_roots=[source.parent, Path.cwd()],
            )
            attempt["attempt_number"] = attempt_number
            attempts.append(attempt)
        classification = classify(attempts, item["document_sha256"])
        deterministic = (
            attempts[0]["result"] == attempts[1]["result"]
            and attempts[0]["extract_hash"] == attempts[1]["extract_hash"]
        )
        contract_mismatches = sorted(
            {
                key
                for attempt in attempts
                for key, expected_value in expected.items()
                if attempt[key] != expected_value
            }
        )
        results.append(
            {
                "regulation_code": item["regulation_code"],
                "regulation_name": item["regulation_name"],
                "notice_evidence_status": item["notice_evidence_status"],
                "source_kind": observed["kind"],
                "source_owner_id": observed["owner_id"],
                "source_url": item["source_url"],
                "file_name": observed["filename"],
                "content_length": int(item["content_length"]),
                "baseline_sha256": item["document_sha256"],
                "classification": classification,
                "deterministic": deterministic,
                "contract_mismatches": contract_mismatches,
                "attempts": attempts,
            }
        )

    counts = Counter(row["classification"] for row in results)
    failure_signatures = Counter(
        f"{attempt['error_class']}:{attempt['error_message']}"
        for row in results
        for attempt in row["attempts"]
        if attempt["error_class"]
    )
    guardrail_violations = []
    if counts["INPUT_INTEGRITY_MISMATCH"]:
        guardrail_violations.append("INPUT_INTEGRITY_MISMATCH")
    if any(row["contract_mismatches"] for row in results):
        guardrail_violations.append("PARSER_OR_ENVIRONMENT_CONTRACT_CHANGED")
    if any(attempt["parser_code_dirty"] for row in results for attempt in row["attempts"]):
        guardrail_violations.append("PARSER_CODE_DIRTY")
    if any(not row["deterministic"] for row in results):
        guardrail_violations.append("NONDETERMINISTIC_EXTRACT")
    if failure_signatures:
        guardrail_violations.append("NEW_FAILURE_SIGNATURE")

    finished_at = datetime.now(timezone.utc)
    output = {
        "batch_run_id": batch_run_id,
        "provenance": "ACTUAL_EXECUTION",
        "canary_run_id": canary["canary_run_id"],
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "evidence_as_of": release_manifest["finished_at"],
        "population_count": len(items),
        "attempt_count": len(items) * 2,
        "expected_parser_environment_contract": expected,
        "source_hashes": {
            "measurement_items": sha256_file(args.items),
            "extraction_manifest": sha256_file(args.extraction_manifest),
            "release_manifest": sha256_file(args.release_manifest),
            "canary": sha256_file(args.canary),
            "dependency_lock": sha256_file(args.lock_file),
        },
        "classification_counts": {
            name: counts[name]
            for name in (
                "PARSE_OK_AND_IDENTIFIED",
                "PARSE_OK_IDENTITY_UNRESOLVED",
                "PARSE_FAILED",
                "INPUT_INTEGRITY_MISMATCH",
            )
        },
        "failure_signature_counts": dict(sorted(failure_signatures.items())),
        "extract_hash_reproducibility_anomaly_count": sum(
            not row["deterministic"] for row in results
        ),
        "parser_residual_resolution_candidate_count": counts["PARSE_OK_AND_IDENTIFIED"],
        "new_residual_candidate_counts": {
            "IDENTITY_RESIDUAL": counts["PARSE_OK_IDENTITY_UNRESOLVED"],
            "PARSER_RESIDUAL": counts["PARSE_FAILED"],
            "INPUT_INTEGRITY_RESIDUAL": counts["INPUT_INTEGRITY_MISMATCH"],
        },
        "guardrail_violations": guardrail_violations,
        "automatic_followup_blocked": bool(guardrail_violations),
        "state_changes_performed": False,
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(
        (json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    )
    print(
        json.dumps(
            {
                "batch_run_id": batch_run_id,
                "population": len(items),
                "classifications": output["classification_counts"],
                "guardrail_violations": guardrail_violations,
                "automatic_followup_blocked": output["automatic_followup_blocked"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 2 if guardrail_violations else 0


if __name__ == "__main__":
    raise SystemExit(main())
