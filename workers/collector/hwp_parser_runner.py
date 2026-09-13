#!/usr/bin/env python3
"""Deterministic HWP extraction with complete, sanitized execution provenance."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import platform
import re
import subprocess
import sys
import traceback
import uuid
import zlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    import olefile  # type: ignore
except Exception:  # recorded by run_file rather than hidden at import time
    olefile = None


PARSER_NAME = "kodit-hwp-ole"
PARSER_VERSION = "0.1.0"
OLE_MAGIC = bytes.fromhex("d0cf11e0a1b11ae1")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def normalize_identity(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value).casefold()


def detect_magic(data: bytes) -> str:
    if data.startswith(OLE_MAGIC):
        return "OLE_HWP"
    if data.startswith(b"PK\x03\x04"):
        return "ZIP_HWPX"
    if data.startswith(b"%PDF-"):
        return "PDF"
    if data.startswith(b"\x9b DRMONE") or b"Fasoo DRM" in data[:200]:
        return "DRM_WRAPPED"
    return "UNKNOWN"


def extract_hwp(data: bytes) -> str:
    if olefile is None:
        raise RuntimeError("olefile import failed")
    if not hasattr(olefile, "OleFileIO"):
        raise RuntimeError("olefile.OleFileIO is unavailable")
    if detect_magic(data) != "OLE_HWP":
        raise ValueError("input is not an OLE/HWP document")

    with olefile.OleFileIO(io.BytesIO(data)) as ole:
        if not ole.exists("FileHeader"):
            raise ValueError("HWP FileHeader stream is missing")
        header = ole.openstream("FileHeader").read()
        if len(header) < 40:
            raise ValueError("HWP FileHeader is truncated")
        flags = int.from_bytes(header[36:40], "little")
        compressed = bool(flags & 1)
        encrypted = bool(flags & 2)
        if encrypted:
            raise PermissionError("HWP encryption flag is set")

        sections = sorted(
            (
                entry
                for entry in ole.listdir()
                if len(entry) == 2
                and entry[0] == "BodyText"
                and entry[1].startswith("Section")
            ),
            key=lambda entry: int(re.search(r"(\d+)$", entry[1]).group(1)),
        )
        if not sections:
            raise ValueError("HWP BodyText sections are missing")

        paragraphs: list[str] = []
        for entry in sections:
            body = ole.openstream(entry).read()
            if compressed:
                body = zlib.decompress(body, -15)
            offset = 0
            while offset + 4 <= len(body):
                record_header = int.from_bytes(body[offset : offset + 4], "little")
                offset += 4
                tag_id = record_header & 0x3FF
                size = (record_header >> 20) & 0xFFF
                if size == 0xFFF:
                    if offset + 4 > len(body):
                        raise ValueError("extended HWP record size is truncated")
                    size = int.from_bytes(body[offset : offset + 4], "little")
                    offset += 4
                if offset + size > len(body):
                    raise ValueError("HWP record payload is truncated")
                payload = body[offset : offset + size]
                offset += size
                if tag_id == 67 and payload:
                    text = payload.decode("utf-16le", errors="replace")
                    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", text)
                    text = re.sub(r"\s+", " ", text).strip()
                    if text:
                        paragraphs.append(text)

    extracted = "\n".join(paragraphs).strip()
    if not extracted:
        raise ValueError("HWP paragraph text is empty")
    return extracted


def git_value(args: list[str], fallback: str = "UNKNOWN") -> str:
    try:
        return subprocess.check_output(
            ["git", *args], stderr=subprocess.DEVNULL, text=True
        ).strip() or fallback
    except Exception:
        return fallback


def dependency_lock_hash(lock_path: Path) -> str:
    return sha256_bytes(lock_path.read_bytes()) if lock_path.exists() else "UNKNOWN"


def environment(lock_path: Path) -> dict[str, Any]:
    engine_version = getattr(olefile, "__version__", "UNKNOWN") if olefile else "UNAVAILABLE"
    values = {
        "os": platform.system(),
        "os_release": platform.release(),
        "architecture": platform.machine(),
        "python_implementation": platform.python_implementation(),
        "runtime_version": platform.python_version(),
        "parser_engine": "olefile",
        "parser_engine_version": engine_version,
        "dependency_lock_hash": dependency_lock_hash(lock_path),
    }
    values["environment_fingerprint"] = sha256_bytes(
        json.dumps(values, ensure_ascii=False, sort_keys=True).encode("utf-8")
    )
    return values


def sanitize_trace(value: str, roots: Iterable[Path]) -> str:
    sanitized = value
    for root in roots:
        sanitized = sanitized.replace(str(root.resolve()), "<REDACTED_ROOT>")
    return sanitized


def run_file(
    file_path: Path,
    *,
    expected_sha256: str,
    file_name: str,
    regulation_name: str,
    aliases: list[str],
    evidence_as_of: str,
    lock_path: Path,
    redact_roots: Iterable[Path] = (),
) -> dict[str, Any]:
    parser_run_id = str(uuid.uuid4())
    started = datetime.now(timezone.utc)
    data = b""
    extracted = ""
    error_class = ""
    error_message = ""
    full_stack_trace = ""
    result = "FAILED"
    identity_matched = False
    try:
        data = file_path.read_bytes()
        actual_sha256 = sha256_bytes(data)
        if actual_sha256 != expected_sha256:
            raise ValueError("input SHA-256 does not match baseline")
        extracted = extract_hwp(data)
        normalized_text = normalize_identity(extracted)
        candidates = [regulation_name, *aliases]
        identity_matched = any(
            normalize_identity(candidate) in normalized_text
            for candidate in candidates
            if normalize_identity(candidate)
        )
        result = "SUCCESS" if identity_matched else "IDENTITY_NOT_FOUND"
    except Exception as exc:
        error_class = type(exc).__name__
        error_message = str(exc)
        full_stack_trace = sanitize_trace(traceback.format_exc(), redact_roots)

    finished = datetime.now(timezone.utc)
    env = environment(lock_path)
    return {
        "parser_run_id": parser_run_id,
        "provenance": "ACTUAL_EXECUTION",
        "evidence_as_of": evidence_as_of,
        "input_sha256": sha256_bytes(data) if data else "",
        "file_name": file_name,
        "detected_magic": detect_magic(data),
        "parser_name": PARSER_NAME,
        "parser_version": PARSER_VERSION,
        "parser_engine": env["parser_engine"],
        "parser_engine_version": env["parser_engine_version"],
        "code_commit_sha": git_value(["rev-parse", "HEAD"]),
        "code_worktree_dirty": bool(git_value(["status", "--porcelain"], "")),
        "parser_source_sha256": sha256_bytes(Path(__file__).read_bytes()),
        "runtime_version": env["runtime_version"],
        "dependency_lock_hash": env["dependency_lock_hash"],
        "environment_fingerprint": env["environment_fingerprint"],
        "environment": env,
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "result": result,
        "identity_matched": identity_matched,
        "error_class": error_class,
        "error_message": error_message,
        "full_stack_trace": full_stack_trace,
        "extract_hash": sha256_bytes(extracted.encode("utf-8")) if extracted else "",
        "extracted_char_count": len(extracted),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--file-name", required=True)
    parser.add_argument("--regulation-name", required=True)
    parser.add_argument("--alias", action="append", default=[])
    parser.add_argument("--evidence-as-of", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--lock-file",
        type=Path,
        default=Path(__file__).with_name("requirements.txt"),
    )
    args = parser.parse_args()
    record = run_file(
        args.file,
        expected_sha256=args.expected_sha256,
        file_name=args.file_name,
        regulation_name=args.regulation_name,
        aliases=args.alias,
        evidence_as_of=args.evidence_as_of,
        lock_path=args.lock_file,
        redact_roots=[args.file.parent, Path.cwd()],
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: record[key] for key in ("parser_run_id", "result", "extract_hash")}, ensure_ascii=False))
    return 0 if record["result"] == "SUCCESS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
