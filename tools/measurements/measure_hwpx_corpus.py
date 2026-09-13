#!/usr/bin/env python3
"""Measure ZIP/HWPX files in a preserved corpus without network or DB access."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ZIP_MAGIC = b"PK\x03\x04"
OLE_MAGIC = bytes.fromhex("d0cf11e0a1b11ae1")
SECTION_RE = re.compile(r"^contents/section\d+\.xml$", re.IGNORECASE)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def inspect_file(path: Path, root: Path) -> dict[str, object]:
    data = path.read_bytes()
    magic = "OTHER"
    mimetype = ""
    section_count = 0
    has_content_hpf = False
    has_header_xml = False
    zip_error = ""
    if data.startswith(OLE_MAGIC):
        magic = "OLE_HWP"
    elif data.startswith(b"%PDF-"):
        magic = "PDF"
    elif data.startswith(ZIP_MAGIC):
        magic = "ZIP_OTHER"
        try:
            with zipfile.ZipFile(path) as archive:
                names = archive.namelist()
                lower_names = {name.lower() for name in names}
                section_count = sum(bool(SECTION_RE.match(name)) for name in names)
                has_content_hpf = "contents/content.hpf" in lower_names
                has_header_xml = "contents/header.xml" in lower_names
                if "mimetype" in names:
                    mimetype = archive.read("mimetype").decode("ascii", errors="replace").strip()
                if (
                    section_count > 0
                    and has_content_hpf
                    and has_header_xml
                    and mimetype == "application/hwp+zip"
                ):
                    magic = "ZIP_HWPX"
                elif section_count > 0:
                    magic = "ZIP_HWPX_CANDIDATE"
        except Exception as exc:
            zip_error = f"{type(exc).__name__}:{exc}"
            magic = "ZIP_INVALID"
    return {
        "relative_path": path.relative_to(root).as_posix(),
        "file_name": path.name,
        "extension": path.suffix.lower(),
        "size_bytes": len(data),
        "sha256": sha256(data),
        "detected_magic": magic,
        "mimetype": mimetype,
        "section_count": section_count,
        "has_content_hpf": has_content_hpf,
        "has_header_xml": has_header_xml,
        "zip_error": zip_error,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    root = args.corpus_root.resolve()
    if not root.is_dir():
        raise ValueError("corpus root does not exist")
    files = sorted(path for path in root.rglob("*") if path.is_file())
    rows = [inspect_file(path, root) for path in files]
    magic_counts = Counter(str(row["detected_magic"]) for row in rows)
    extension_counts = Counter(str(row["extension"]) for row in rows)
    output = {
        "measurement_run_id": __import__("uuid").uuid4().hex,
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "external_http_used": False,
        "database_changes_performed": False,
        "corpus_label": "preannouncement_rule_match_20260831/downloads",
        "file_count": len(rows),
        "magic_counts": dict(sorted(magic_counts.items())),
        "extension_counts": dict(sorted(extension_counts.items())),
        "strict_hwpx_count": magic_counts["ZIP_HWPX"],
        "hwpx_candidate_count": magic_counts["ZIP_HWPX_CANDIDATE"],
        "files": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(
        (json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    )
    print(json.dumps({
        "measurement_run_id": output["measurement_run_id"],
        "file_count": output["file_count"],
        "magic_counts": output["magic_counts"],
        "strict_hwpx_count": output["strict_hwpx_count"],
        "hwpx_candidate_count": output["hwpx_candidate_count"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
