"""PDF structure and text extraction only; identity is intentionally separate."""

from __future__ import annotations

import io
from typing import Any

try:
    from pypdf import PdfReader  # type: ignore
except Exception:
    PdfReader = None

PARSER_NAME = "kodit-pdf-pypdf"
PARSER_VERSION = "0.1.0"
PARSER_ENGINE = "pypdf"


def detect_magic(data: bytes) -> str:
    if data.startswith(b"%PDF-"):
        return "PDF"
    if data.startswith(b"\x9b DRMONE"):
        return "DRMONE_CONTAINER"
    if data.startswith(b"<!-- FasooSecureContainer"):
        return "FASOO_SECURE_CONTAINER"
    if data.startswith(bytes.fromhex("d0cf11e0a1b11ae1")):
        return "OLE_HWP"
    if data.startswith(b"PK\x03\x04"):
        return "ZIP"
    return "UNKNOWN"


def _ratio(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 12) if denominator else 0.0


def parse_pdf_bytes(data: bytes) -> dict[str, Any]:
    if detect_magic(data) != "PDF":
        raise ValueError("input is not a strict PDF document")
    if PdfReader is None:
        raise RuntimeError("pypdf import failed")

    reader = PdfReader(io.BytesIO(data), strict=False)
    if reader.is_encrypted:
        return {
            "result": "ENCRYPTED",
            "extracted_text": "",
            "page_count": 0,
            "extracted_char_count": 0,
            "replacement_char_count": 0,
            "replacement_char_ratio": 0.0,
            "hangul_char_count": 0,
            "hangul_ratio": 0.0,
            "pages_with_text": 0,
            "pages_without_text": 0,
        }

    page_count = len(reader.pages)
    page_texts: list[str] = []
    pages_with_text = 0
    for page in reader.pages:
        text = page.extract_text() or ""
        normalized = text.strip()
        page_texts.append(normalized)
        if normalized:
            pages_with_text += 1
    extracted_text = "\n".join(text for text in page_texts if text)
    extracted_char_count = len(extracted_text)
    replacement_char_count = extracted_text.count("\ufffd")
    hangul_char_count = sum("\uac00" <= char <= "\ud7a3" for char in extracted_text)
    return {
        "result": "SUCCESS" if extracted_char_count else "NO_EXTRACTABLE_TEXT",
        "extracted_text": extracted_text,
        "page_count": page_count,
        "extracted_char_count": extracted_char_count,
        "replacement_char_count": replacement_char_count,
        "replacement_char_ratio": _ratio(
            replacement_char_count, extracted_char_count
        ),
        "hangul_char_count": hangul_char_count,
        "hangul_ratio": _ratio(hangul_char_count, extracted_char_count),
        "pages_with_text": pages_with_text,
        "pages_without_text": page_count - pages_with_text,
    }
