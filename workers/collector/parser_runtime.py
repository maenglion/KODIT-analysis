"""Shared, deterministic parser runtime contract and fingerprint."""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import platform
import re
from pathlib import Path
from typing import Any, Iterable

CONTRACT_PATH = Path(__file__).with_name("parser-runtime-contract.json")
PIN_RE = re.compile(r"^([A-Za-z0-9_.-]+)==([^\s]+)$")


class RuntimeContractError(RuntimeError):
    """The host runtime does not satisfy the checked-in parser contract."""


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def dependency_pins(lock_path: Path) -> dict[str, str]:
    pins: dict[str, str] = {}
    for raw_line in lock_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = PIN_RE.fullmatch(line)
        if not match:
            raise RuntimeContractError(f"dependency is not exactly pinned: {line}")
        pins[match.group(1).lower()] = match.group(2)
    return dict(sorted(pins.items()))


def installed_version(name: str) -> str:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return "UNAVAILABLE"


def build_runtime_manifest(lock_path: Path) -> dict[str, Any]:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    pins = dependency_pins(lock_path)
    required = [str(name).lower() for name in contract["required_dependencies"]]
    dependencies = [
        {
            "name": name,
            "locked_version": pins.get(name, "UNPINNED"),
            "installed_version": installed_version(name),
        }
        for name in required
    ]
    conditions = {
        "contract_version": contract["contract_version"],
        "python_implementation": platform.python_implementation(),
        "python_version": platform.python_version(),
        "os": platform.system(),
        "os_release": platform.release(),
        "architecture": platform.machine(),
        "dependencies": dependencies,
        "dependency_lock_sha256": sha256_bytes(lock_path.read_bytes()),
        "runtime_contract_sha256": sha256_bytes(CONTRACT_PATH.read_bytes()),
    }
    violations: list[str] = []
    if conditions["python_implementation"] != contract["python_implementation"]:
        violations.append("PYTHON_IMPLEMENTATION_MISMATCH")
    if conditions["python_version"] != contract["python_version"]:
        violations.append("PYTHON_VERSION_MISMATCH")
    for dependency in dependencies:
        if dependency["locked_version"] == "UNPINNED":
            violations.append(f"DEPENDENCY_UNPINNED:{dependency['name']}")
        elif dependency["installed_version"] == "UNAVAILABLE":
            violations.append(f"DEPENDENCY_UNAVAILABLE:{dependency['name']}")
        elif dependency["installed_version"] != dependency["locked_version"]:
            violations.append(f"DEPENDENCY_VERSION_MISMATCH:{dependency['name']}")
    runtime_manifest_sha256 = sha256_bytes(canonical_json(conditions))
    fingerprint_input = {
        "conditions": conditions,
        "runtime_manifest_sha256": runtime_manifest_sha256,
    }
    return {
        **conditions,
        "runtime_manifest_sha256": runtime_manifest_sha256,
        "environment_fingerprint": sha256_bytes(canonical_json(fingerprint_input)),
        "runtime_contract_status": "SATISFIED" if not violations else "FAILED",
        "runtime_contract_violations": violations,
    }


def require_runtime(manifest: dict[str, Any]) -> None:
    if manifest["runtime_contract_status"] != "SATISFIED":
        raise RuntimeContractError(
            "parser runtime contract failed: "
            + ", ".join(manifest["runtime_contract_violations"])
        )


def sanitize_trace(value: str, roots: Iterable[Path] = ()) -> str:
    sanitized = value
    for root in roots:
        sanitized = sanitized.replace(str(root.resolve()), "<REDACTED_ROOT>")
    return re.sub(
        r"(?i)(?<![A-Za-z0-9_])[A-Z]:\\[^\"\r\n]+",
        "<REDACTED_PATH>",
        sanitized,
    )
