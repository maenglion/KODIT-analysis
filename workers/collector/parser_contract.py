"""Shared document-parser contract helpers."""

from __future__ import annotations

import re


def normalize_identity(value: str) -> str:
    """Normalize identity consistently across PDF/HWP/HWPX dispatch paths."""
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value).casefold()
