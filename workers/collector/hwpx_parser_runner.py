#!/usr/bin/env python3
"""HWPX runner with the same execution-ledger contract as the HWP runner."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import subprocess
import sys
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from hwpx_parser import (
    PARSER_ENGINE,
    PARSER_ENGINE_VERSION,
    PARSER_NAME,
    PARSER_VERSION,
    detect_magic,
    parse_hwpx_bytes,
)
from parser_contract import normalize_identity


SOURCE_FILES = (
    Path(__file__),
    Path(__file__).with_name("hwpx_parser.py"),
    Path(__file__).with_name("parser_contract.py"),
)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def git_value(args: list[str], fallback: str = "UNKNOWN") -> str:
    try:
        return subprocess.check_output(
            ["git", *args], stderr=subprocess.DEVNULL, text=True
        ).strip() or fallback
    except Exception:
        return fallback


def parser_source_sha256() -> str:
    digest = hashlib.sha256()
    for path in sorted(SOURCE_FILES, key=lambda item: item.name):
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
    return digest.hexdigest()


def parser_code_dirty() -> bool | None:
    try:
        result = subprocess.run(
            ["git", "diff", "--quiet", "HEAD", "--", *(str(path.resolve()) for path in SOURCE_FILES)],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return result.returncode != 0
    except Exception:
        return None


def lock_hash(path: Path) -> str:
    return sha256_bytes(path.read_bytes()) if path.exists() else "UNKNOWN"


def environment(lock_path: Path) -> dict[str, Any]:
    values = {
        "os": platform.system(),
        "os_release": platform.release(),
        "architecture": platform.machine(),
        "python_implementation": platform.python_implementation(),
        "runtime_version": platform.python_version(),
        "parser_engine": PARSER_ENGINE,
        "parser_engine_version": PARSER_ENGINE_VERSION,
        "dependency_lock_hash": lock_hash(lock_path),
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
        if sha256_bytes(data) != expected_sha256:
            raise ValueError("input SHA-256 does not match baseline")
        extracted = parse_hwpx_bytes(data)
        normalized_text = normalize_identity(extracted)
        identity_matched = any(
            normalize_identity(candidate) in normalized_text
            for candidate in [regulation_name, *aliases]
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
        "parser_engine": PARSER_ENGINE,
        "parser_engine_version": PARSER_ENGINE_VERSION,
        "code_commit_sha": git_value(["rev-parse", "HEAD"]),
        "parser_code_dirty": parser_code_dirty(),
        "parser_source_sha256": parser_source_sha256(),
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
    parser.add_argument("--lock-file", type=Path, default=Path(__file__).with_name("requirements.txt"))
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
    args.output.write_bytes((json.dumps(record, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({key: record[key] for key in ("parser_run_id", "result", "extract_hash")}, ensure_ascii=False))
    return 0 if record["result"] == "SUCCESS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
