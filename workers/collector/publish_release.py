#!/usr/bin/env python3
"""Publish one validated regulation release through the service-only RPC."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
import uuid


def rpc(name: str, payload: dict) -> object:
    base_url = os.environ.get("KODIT_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("KODIT_SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not key:
        raise RuntimeError("Supabase server credentials are not configured")
    request = urllib.request.Request(
        f"{base_url}/rest/v1/rpc/{name}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Content-Profile": "api", "Accept-Profile": "api"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"publish RPC rejected ({error.code}): {detail[:500]}") from error


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--confirmation", required=True)
    parser.add_argument("--approval-note", required=True)
    parser.add_argument("--actor", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    uuid.UUID(args.release_id)
    if args.confirmation != "PUBLISH":
        raise ValueError("confirmation must be PUBLISH")
    result = rpc("publish_regulation_release", {
        "p_release_id": args.release_id,
        "p_confirmation": args.confirmation,
        "p_approval_note": args.approval_note,
        "p_approved_by_actor": args.actor,
        "p_dry_run": args.dry_run,
    })
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"release approval failed: {error}", file=sys.stderr)
        sys.exit(1)
