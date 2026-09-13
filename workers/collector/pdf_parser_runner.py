#!/usr/bin/env python3
"""Audited PDF runner with parser and identity layers kept separate."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from parser_runtime import build_runtime_manifest, require_runtime
from pdf_parser import (
    PARSER_ENGINE,
    PARSER_NAME,
    PARSER_VERSION,
    detect_magic,
    parse_pdf_bytes,
)

SOURCE_FILES = (
    Path(__file__),
    Path(__file__).with_name("pdf_parser.py"),
    Path(__file__).with_name("parser_runtime.py"),
    Path(__file__).with_name("parser-runtime-contract.json"),
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
    evidence_as_of: str,
    lock_path: Path,
    redact_roots: Iterable[Path] = (),
) -> dict[str, Any]:
    parser_run_id = str(uuid.uuid4())
    started = datetime.now(timezone.utc)
    data = b""
    extracted_text = ""
    result = "EXTRACTION_FAILED"
    failure_layer = ""
    error_class = ""
    error_message = ""
    full_stack_trace = ""
    metrics: dict[str, int | float] = {
        "page_count": 0,
        "extracted_char_count": 0,
        "replacement_char_count": 0,
        "replacement_char_ratio": 0.0,
        "hangul_char_count": 0,
        "hangul_ratio": 0.0,
        "pages_with_text": 0,
        "pages_without_text": 0,
    }
    environment = build_runtime_manifest(lock_path)
    try:
        require_runtime(environment)
        data = file_path.read_bytes()
        if sha256_bytes(data) != expected_sha256:
            raise ValueError("input SHA-256 does not match baseline")
        parsed = parse_pdf_bytes(data)
        result = parsed["result"]
        extracted_text = parsed.pop("extracted_text")
        metrics.update(parsed)
        metrics.pop("result", None)
    except Exception as exc:
        failure_layer = (
            "RUNTIME"
            if type(exc).__name__ == "RuntimeContractError"
            else "INPUT_INTEGRITY"
            if isinstance(exc, ValueError) and "SHA-256" in str(exc)
            else "PARSER"
        )
        error_class = type(exc).__name__
        error_message = str(exc)
        full_stack_trace = sanitize_trace(traceback.format_exc(), redact_roots)

    finished = datetime.now(timezone.utc)
    engine_version = next(
        dependency["installed_version"]
        for dependency in environment["dependencies"]
        if dependency["name"] == "pypdf"
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
        "parser_engine": PARSER_ENGINE,
        "parser_engine_version": engine_version,
        "code_commit_sha": git_value(["rev-parse", "HEAD"]),
        "parser_code_dirty": parser_code_dirty(),
        "parser_source_sha256": parser_source_sha256(),
        "runtime_version": environment["python_version"],
        "dependency_lock_hash": environment["dependency_lock_sha256"],
        "runtime_manifest_sha256": environment["runtime_manifest_sha256"],
        "environment_fingerprint": environment["environment_fingerprint"],
        "environment": environment,
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "result": result,
        "failure_layer": failure_layer,
        "error_class": error_class,
        "error_message": error_message,
        "full_stack_trace": full_stack_trace,
        "extract_hash": (
            sha256_bytes(extracted_text.encode("utf-8")) if extracted_text else ""
        ),
        **metrics,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--file-name", required=True)
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
        evidence_as_of=args.evidence_as_of,
        lock_path=args.lock_file,
        redact_roots=[args.file.parent, Path.cwd()],
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(
        (json.dumps(record, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    )
    print(json.dumps({
        key: record[key]
        for key in ("parser_run_id", "result", "extract_hash", "page_count")
    }, ensure_ascii=False))
    return 0 if record["result"] != "EXTRACTION_FAILED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
