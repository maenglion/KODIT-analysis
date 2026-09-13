#!/usr/bin/env python3
"""Re-measure strict PDF files from the preserved corpus without parsing them."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus-root", required=True, type=Path)
    parser.add_argument("--baseline-measurement", required=True, type=Path)
    parser.add_argument("--extraction-manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    baseline = json.loads(args.baseline_measurement.read_text(encoding="utf-8"))
    baseline_by_path = {row["relative_path"]: row for row in baseline["files"]}
    observations = {row["sha256"]: row for row in read_csv(args.extraction_manifest)}
    results = []
    scanned_count = 0
    for path in sorted(item for item in args.corpus_root.rglob("*") if item.is_file()):
        scanned_count += 1
        data = path.read_bytes()
        if not data.startswith(b"%PDF-"):
            continue
        relative_path = path.relative_to(args.corpus_root).as_posix()
        digest = sha256(data)
        previous = baseline_by_path.get(relative_path)
        observation = observations.get(digest, {})
        parts = Path(relative_path).parts
        years = sorted(set(re.findall(r"(?:19|20)\d{2}", path.name)))
        results.append({
            "relative_path": relative_path,
            "source_kind": parts[0] if parts else "",
            "source_owner_id": parts[1] if len(parts) > 1 else "",
            "file_name": path.name,
            "size_bytes": len(data),
            "sha256": digest,
            "detected_magic": "PDF",
            "baseline_sha256": previous["sha256"] if previous else "",
            "baseline_sha_matches": bool(previous and previous["sha256"] == digest),
            "observed_content_type": observation.get("content_type", ""),
            "legacy_extraction_status": observation.get("extraction_status", ""),
            "legacy_text_chars": int(observation.get("text_chars") or 0),
            "collected_at_kst": observation.get("collected_at_kst", ""),
            "year_tokens": years,
        })

    source_counts = Counter(row["source_kind"] for row in results)
    legacy_counts = Counter(row["legacy_extraction_status"] for row in results)
    output = {
        "measurement_run_id": str(uuid.uuid4()),
        "measurement_type": "STRICT_PDF_CORPUS_IDENTIFICATION",
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "scanned_file_count": scanned_count,
        "strict_pdf_count": len(results),
        "source_counts": dict(sorted(source_counts.items())),
        "legacy_extraction_status_counts": dict(sorted(legacy_counts.items())),
        "baseline_missing_count": sum(not row["baseline_sha256"] for row in results),
        "baseline_sha_mismatch_count": sum(
            bool(row["baseline_sha256"]) and not row["baseline_sha_matches"]
            for row in results
        ),
        "external_http_used": False,
        "state_changes_performed": False,
        "files": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(
        (json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    )
    print(json.dumps({
        "measurement_run_id": output["measurement_run_id"],
        "scanned": scanned_count,
        "strict_pdf": len(results),
        "sources": output["source_counts"],
        "baseline_missing": output["baseline_missing_count"],
        "baseline_sha_mismatch": output["baseline_sha_mismatch_count"],
    }, ensure_ascii=False, indent=2))
    return 2 if output["baseline_missing_count"] or output["baseline_sha_mismatch_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
