#!/usr/bin/env python3
"""Deterministic HWP extraction with complete, sanitized execution provenance."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import traceback
import uuid
import zlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from failure_taxonomy import (
    DependencyImportFailed,
    MagicMismatch,
    Sha256Mismatch,
    classify_failure,
)
from parser_contract import normalize_identity
from parser_runtime import build_runtime_manifest, require_runtime, sanitize_trace

try:
    import olefile  # type: ignore
except Exception:  # recorded by run_file rather than hidden at import time
    olefile = None


PARSER_NAME = "kodit-hwp-ole"
PARSER_VERSION = "0.1.1"
OLE_MAGIC = bytes.fromhex("d0cf11e0a1b11ae1")
SOURCE_FILES = (
    Path(__file__),
    Path(__file__).with_name("failure_taxonomy.py"),
    Path(__file__).with_name("parser_contract.py"),
    Path(__file__).with_name("parser_runtime.py"),
    Path(__file__).with_name("parser-runtime-contract.json"),
)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


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


def parser_code_dirty() -> bool | None:
    try:
        result = subprocess.run(
            [
                "git",
                "diff",
                "--quiet",
                "HEAD",
                "--",
                *(str(path.resolve()) for path in SOURCE_FILES),
            ],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return result.returncode != 0
    except Exception:
        return None


def parser_source_sha256() -> str:
    digest = hashlib.sha256()
    for path in sorted(SOURCE_FILES, key=lambda item: item.name):
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
    return digest.hexdigest()


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
    failure_layer = ""
    failure_domain = ""
    failure_code = ""
    env = build_runtime_manifest(lock_path)
    try:
        require_runtime(env)
        if olefile is None or not hasattr(olefile, "OleFileIO"):
            raise DependencyImportFailed("olefile import failed")
        data = file_path.read_bytes()
        actual_sha256 = sha256_bytes(data)
        if actual_sha256 != expected_sha256:
            raise Sha256Mismatch("input SHA-256 does not match baseline")
        if detect_magic(data) != "OLE_HWP":
            raise MagicMismatch("input magic is not OLE/HWP")
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
        failure = classify_failure(exc)
        failure_layer = failure.domain
        failure_domain = failure.domain
        failure_code = failure.code
        error_class = type(exc).__name__
        error_message = str(exc)
        full_stack_trace = sanitize_trace(traceback.format_exc(), redact_roots)

    finished = datetime.now(timezone.utc)
    engine_version = next(
        dependency["installed_version"]
        for dependency in env["dependencies"]
        if dependency["name"] == "olefile"
    )
    return {
        "parser_run_id": parser_run_id,
        "provenance": "ACTUAL_EXECUTION",
        "evidence_as_of": evidence_as_of,
        "input_sha256": sha256_bytes(data) if data else "",
        "file_name": file_name,
        "detected_magic": detect_magic(data),
        "parser_name": PARSER_NAME,
        "parser_version": PARSER_VERSION,
        "parser_engine": "olefile",
        "parser_engine_version": engine_version,
        "code_commit_sha": git_value(["rev-parse", "HEAD"]),
        "parser_code_dirty": parser_code_dirty(),
        "parser_source_sha256": parser_source_sha256(),
        "runtime_version": env["python_version"],
        "dependency_lock_hash": env["dependency_lock_sha256"],
        "runtime_manifest_sha256": env["runtime_manifest_sha256"],
        "environment_fingerprint": env["environment_fingerprint"],
        "environment": env,
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "result": result,
        "identity_matched": identity_matched,
        "failure_layer": failure_layer,
        "failure_domain": failure_domain,
        "failure_code": failure_code,
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
