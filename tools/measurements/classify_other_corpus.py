#!/usr/bin/env python3
"""Read-only magic/container classification for the corpus OTHER population."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import mimetypes
import subprocess
import uuid
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

DRMONE_MAGIC = b"\x9b DRMONE"
FASOO_MAGIC = b"<!-- FasooSecureContainer"
OLE_MAGIC = bytes.fromhex("d0cf11e0a1b11ae1")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def classify_bytes(data: bytes) -> tuple[str, str]:
    if data.startswith(DRMONE_MAGIC):
        return "DRMONE_CONTAINER", "UNSUPPORTED_ENCRYPTED_CONTAINER"
    if data.startswith(FASOO_MAGIC):
        return "FASOO_SECURE_CONTAINER", "UNSUPPORTED_ENCRYPTED_CONTAINER"
    if data.startswith(b"%PDF-"):
        return "PDF", "PDF_RUNNER"
    if data.startswith(OLE_MAGIC):
        return "OLE_COMPOUND", "OLE_INSPECTION_REQUIRED"
    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(__import__("io").BytesIO(data)) as archive:
                names = {name.lower() for name in archive.namelist()}
                if "[content_types].xml" in names and "word/document.xml" in names:
                    return "DOCX", "DOCX_RUNNER_REQUIRED"
                if "[content_types].xml" in names and "xl/workbook.xml" in names:
                    return "XLSX", "XLSX_RUNNER_REQUIRED"
                if "[content_types].xml" in names and "ppt/presentation.xml" in names:
                    return "PPTX", "PPTX_RUNNER_REQUIRED"
                return "ZIP_OTHER", "ZIP_INSPECTION_REQUIRED"
        except Exception:
            return "ZIP_INVALID", "CORRUPTION_INSPECTION_REQUIRED"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG", "IMAGE_OCR_REQUIRED"
    if data.startswith(b"\xff\xd8\xff"):
        return "JPEG", "IMAGE_OCR_REQUIRED"
    if data.lstrip().lower().startswith((b"<!doctype html", b"<html")):
        return "HTML", "HTML_INSPECTION_REQUIRED"
    return "UNKNOWN", "FORMAT_INSPECTION_REQUIRED"


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
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    corpus = json.loads(args.corpus_measurement.read_text(encoding="utf-8"))
    items = [row for row in corpus["files"] if row["detected_magic"] == "OTHER"]
    if len(items) != 50:
        raise ValueError(f"OTHER population must be 50, received {len(items)}")
    with args.extraction_manifest.open("r", encoding="utf-8-sig", newline="") as handle:
        observations = {
            row["sha256"]: row for row in csv.DictReader(handle) if row["sha256"]
        }

    results = []
    for item in sorted(items, key=lambda row: row["relative_path"]):
        data = (args.corpus_root / item["relative_path"]).read_bytes()
        actual_sha = sha256(data)
        if actual_sha != item["sha256"]:
            classification, route = "INPUT_INTEGRITY_MISMATCH", "STOP"
        else:
            classification, route = classify_bytes(data)
        observation = observations.get(item["sha256"], {})
        results.append({
            "relative_path": item["relative_path"],
            "file_name": item["file_name"],
            "extension": item["extension"],
            "size_bytes": len(data),
            "baseline_sha256": item["sha256"],
            "input_sha256": actual_sha,
            "signature_hex": data[:32].hex(),
            "observed_content_type": observation.get("content_type", ""),
            "legacy_extraction_status": observation.get("extraction_status", ""),
            "extension_mime_hint": mimetypes.guess_type(item["file_name"])[0] or "",
            "classification": classification,
            "suggested_route": route,
        })

    counts = Counter(row["classification"] for row in results)
    extension_counts = Counter(
        f"{row['extension']}:{row['classification']}" for row in results
    )
    dirty = runner_dirty()
    output = {
        "measurement_run_id": str(uuid.uuid4()),
        "measurement_type": "OTHER_MAGIC_CONTAINER_CLASSIFICATION",
        "provenance": "ACTUAL_EXECUTION",
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "population_count": len(results),
        "classification_counts": dict(sorted(counts.items())),
        "extension_classification_counts": dict(sorted(extension_counts.items())),
        "unknown_count": counts["UNKNOWN"],
        "input_integrity_mismatch_count": counts["INPUT_INTEGRITY_MISMATCH"],
        "classifier_code_commit_sha": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True
        ).strip(),
        "classifier_code_dirty": dirty,
        "classifier_source_sha256": sha256_file(Path(__file__)),
        "source_hashes": {
            "corpus_measurement": sha256_file(args.corpus_measurement),
            "extraction_manifest": sha256_file(args.extraction_manifest),
        },
        "human_trigger_created": False,
        "state_changes_performed": False,
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(
        (json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    )
    print(json.dumps({
        "measurement_run_id": output["measurement_run_id"],
        "population": len(results),
        "classifications": output["classification_counts"],
        "unknown": output["unknown_count"],
        "classifier_code_dirty": dirty,
    }, ensure_ascii=False, indent=2))
    return 2 if dirty is not False or counts["INPUT_INTEGRITY_MISMATCH"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
