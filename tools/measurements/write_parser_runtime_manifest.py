#!/usr/bin/env python3
"""Write the non-secret parser runtime manifest for the active environment."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

COLLECTOR_DIR = Path(__file__).resolve().parents[2] / "workers" / "collector"
sys.path.insert(0, str(COLLECTOR_DIR))

from parser_runtime import build_runtime_manifest  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock-file", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    runtime = build_runtime_manifest(args.lock_file)
    output = {
        "manifest_type": "KODIT_PARSER_RUNTIME",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        **runtime,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(
        (json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    )
    print(json.dumps({
        "runtime_contract_status": runtime["runtime_contract_status"],
        "runtime_manifest_sha256": runtime["runtime_manifest_sha256"],
        "environment_fingerprint": runtime["environment_fingerprint"],
    }, indent=2))
    return 0 if runtime["runtime_contract_status"] == "SATISFIED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
