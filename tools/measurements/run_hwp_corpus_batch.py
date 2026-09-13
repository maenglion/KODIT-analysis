#!/usr/bin/env python3
"""Measure all strict OLE/HWP corpus files twice without product-state changes."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

TOOLS_DIR = Path(__file__).resolve().parent
COLLECTOR_DIR = Path(__file__).resolve().parents[2] / "workers" / "collector"
sys.path.insert(0, str(TOOLS_DIR))
sys.path.insert(0, str(COLLECTOR_DIR))

from hwp_parser_runner import git_value, run_file  # noqa: E402
from run_hwpx_batch import (  # noqa: E402
    alio_identities,
    item_identity,
    kodit_identities,
    read_csv,
    sha256_file,
)

CLASSIFICATIONS = (
    "PARSE_OK_AND_IDENTIFIED",
    "PARSE_OK_IDENTITY_UNRESOLVED",
    "PARSE_FAILED",
    "INPUT_INTEGRITY_MISMATCH",
)
CONTRACT_KEYS = (
    "parser_name",
    "parser_version",
    "parser_engine",
    "parser_engine_version",
    "parser_source_sha256",
    "dependency_lock_hash",
    "environment_fingerprint",
)


def classify(attempts: list[dict[str, Any]], baseline_sha256: str) -> str:
    if any(
        attempt["input_sha256"] != baseline_sha256
        or attempt["detected_magic"] != "OLE_HWP"
        for attempt in attempts
    ):
        return "INPUT_INTEGRITY_MISMATCH"
    if all(
        attempt["result"] == "SUCCESS" and attempt["identity_matched"]
        for attempt in attempts
    ):
        return "PARSE_OK_AND_IDENTIFIED"
    if all(attempt["result"] == "IDENTITY_NOT_FOUND" for attempt in attempts):
        return "PARSE_OK_IDENTITY_UNRESOLVED"
    return "PARSE_FAILED"


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
    parser.add_argument("--corpus-measurement", required=True, type=Path)
    parser.add_argument("--extraction-manifest", required=True, type=Path)
    parser.add_argument("--rule-mentions", required=True, type=Path)
    parser.add_argument("--alio-rules", required=True, type=Path)
    parser.add_argument("--lock-file", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    corpus = json.loads(args.corpus_measurement.read_text(encoding="utf-8"))
    items = [row for row in corpus["files"] if row["detected_magic"] == "OLE_HWP"]
    if len(items) != 326:
        raise ValueError(f"strict OLE/HWP population must be 326, received {len(items)}")
    extraction_by_sha = {
        row["sha256"]: row
        for row in read_csv(args.extraction_manifest)
        if row["sha256"]
    }
    kodit = kodit_identities(read_csv(args.rule_mentions))
    alio = alio_identities(json.loads(args.alio_rules.read_text(encoding="utf-8")))

    batch_run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)
    expected: dict[str, Any] | None = None
    results: list[dict[str, Any]] = []
    for item in sorted(items, key=lambda row: row["relative_path"]):
        observation = extraction_by_sha.get(item["sha256"])
        if not observation:
            raise ValueError(f"missing source observation: {item['relative_path']}")
        identities, identity_source = item_identity(item, kodit, alio)
        source_path = args.corpus_root / item["relative_path"]
        attempts: list[dict[str, Any]] = []
        for attempt_number in (1, 2):
            attempt = run_file(
                source_path,
                expected_sha256=item["sha256"],
                file_name=item["file_name"],
                regulation_name=identities[0] if identities else "",
                aliases=identities[1:],
                evidence_as_of=observation["collected_at_kst"],
                lock_path=args.lock_file,
                redact_roots=[args.corpus_root, Path.cwd()],
            )
            attempt["attempt_number"] = attempt_number
            attempts.append(attempt)
            if expected is None:
                expected = {key: attempt[key] for key in CONTRACT_KEYS}
        assert expected is not None
        deterministic = (
            attempts[0]["result"] == attempts[1]["result"]
            and attempts[0]["extract_hash"] == attempts[1]["extract_hash"]
            and attempts[0]["environment_fingerprint"]
            == attempts[1]["environment_fingerprint"]
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
                "relative_path": item["relative_path"],
                "source_kind": item["relative_path"].split("/", 1)[0],
                "file_name": item["file_name"],
                "size_bytes": item["size_bytes"],
                "baseline_sha256": item["sha256"],
                "regulation_name": identities[0] if identities else "",
                "aliases": identities[1:],
                "identity_source": identity_source,
                "identity_reference_found": bool(identities),
                "classification": classify(attempts, item["sha256"]),
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
    code_dirty = runner_dirty()
    guardrails: list[str] = []
    if counts["INPUT_INTEGRITY_MISMATCH"]:
        guardrails.append("INPUT_INTEGRITY_MISMATCH")
    if any(row["contract_mismatches"] for row in results):
        guardrails.append("PARSER_OR_ENVIRONMENT_CONTRACT_CHANGED")
    if any(attempt["parser_code_dirty"] for row in results for attempt in row["attempts"]):
        guardrails.append("PARSER_CODE_DIRTY")
    if any(not row["deterministic"] for row in results):
        guardrails.append("NONDETERMINISTIC_EXTRACT")
    if failure_signatures:
        guardrails.append("NEW_FAILURE_SIGNATURE")
    if code_dirty is not False:
        guardrails.append("BATCH_RUNNER_CODE_DIRTY_OR_UNKNOWN")

    output = {
        "batch_run_id": batch_run_id,
        "batch_type": "OLE_HWP_FULL_CORPUS_MEASUREMENT",
        "provenance": "ACTUAL_EXECUTION",
        "started_at": started_at.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "population_count": len(results),
        "attempt_count": len(results) * 2,
        "batch_runner_code_commit_sha": git_value(["rev-parse", "HEAD"]),
        "batch_runner_code_dirty": code_dirty,
        "batch_runner_source_sha256": sha256_file(Path(__file__)),
        "expected_parser_environment_contract": expected,
        "source_hashes": {
            "corpus_measurement": sha256_file(args.corpus_measurement),
            "extraction_manifest": sha256_file(args.extraction_manifest),
            "rule_mentions": sha256_file(args.rule_mentions),
            "alio_rules": sha256_file(args.alio_rules),
            "dependency_lock": sha256_file(args.lock_file),
        },
        "identity_reference_found_count": sum(
            row["identity_reference_found"] for row in results
        ),
        "identity_reference_missing_count": sum(
            not row["identity_reference_found"] for row in results
        ),
        "classification_counts": {name: counts[name] for name in CLASSIFICATIONS},
        "failure_signature_counts": dict(sorted(failure_signatures.items())),
        "extract_hash_reproducibility_anomaly_count": sum(
            not row["deterministic"] for row in results
        ),
        "new_residual_candidate_counts": {
            "IDENTITY_RESIDUAL": counts["PARSE_OK_IDENTITY_UNRESOLVED"],
            "PARSER_RESIDUAL": counts["PARSE_FAILED"],
            "INPUT_INTEGRITY_RESIDUAL": counts["INPUT_INTEGRITY_MISMATCH"],
        },
        "guardrail_violations": guardrails,
        "automatic_followup_blocked": bool(guardrails),
        "state_changes_performed": False,
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(
        (json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    )
    print(json.dumps({
        "batch_run_id": batch_run_id,
        "population": len(results),
        "attempts": len(results) * 2,
        "classifications": output["classification_counts"],
        "guardrail_violations": guardrails,
    }, ensure_ascii=False, indent=2))
    return 2 if guardrails else 0


if __name__ == "__main__":
    raise SystemExit(main())
