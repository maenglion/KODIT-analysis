"""Private, immutable extraction-artifact boundary shared by all parsers."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Mapping


EXTRACTION_CONTRACT_VERSION = "v1.0"


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def build_extraction_artifact(
    parser_record: Mapping[str, Any],
    extracted_text: str,
) -> dict[str, Any]:
    """Build the private text artifact linked to one parser execution."""
    if not extracted_text:
        raise ValueError("an extraction artifact requires non-empty text")

    document_sha256 = str(parser_record.get("input_sha256", ""))
    if len(document_sha256) != 64:
        raise ValueError("parser record is missing a valid input SHA-256")

    extract_hash = sha256_text(extracted_text)
    recorded_hash = str(parser_record.get("extract_hash", ""))
    recorded_count = parser_record.get("extracted_char_count")
    if recorded_hash != extract_hash:
        raise ValueError("parser record extract hash does not match extracted text")
    if recorded_count != len(extracted_text):
        raise ValueError("parser record character count does not match extracted text")

    return {
        "extraction_contract_version": EXTRACTION_CONTRACT_VERSION,
        "parser_run_id": parser_record["parser_run_id"],
        "document_sha256": document_sha256,
        "extract_hash": extract_hash,
        "extracted_char_count": len(extracted_text),
        "extracted_text": extracted_text,
    }


def write_extraction_artifact(path: Path, artifact: Mapping[str, Any]) -> None:
    """Write once; an identical existing artifact is an idempotent no-op."""
    payload = (json.dumps(dict(artifact), ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() == payload:
            return
        raise FileExistsError(f"refusing to overwrite a different extraction artifact: {path}")
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_bytes(payload)
    temporary.replace(path)
