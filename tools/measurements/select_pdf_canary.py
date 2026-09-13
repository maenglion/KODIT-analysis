#!/usr/bin/env python3
"""Select a deterministic, source/size-stratified real PDF canary."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def quantile_samples(rows: list[dict], count: int) -> list[dict]:
    ordered = sorted(rows, key=lambda row: (row["size_bytes"], row["relative_path"]))
    selected: list[dict] = []
    used_owners: set[str] = set()
    for index in range(count):
        target = round(index * (len(ordered) - 1) / max(count - 1, 1))
        choices = sorted(
            range(len(ordered)),
            key=lambda position: (abs(position - target), position),
        )
        chosen = next(
            (
                ordered[position]
                for position in choices
                if ordered[position] not in selected
                and ordered[position]["source_owner_id"] not in used_owners
            ),
            next(ordered[position] for position in choices if ordered[position] not in selected),
        )
        selected.append(chosen)
        used_owners.add(chosen["source_owner_id"])
    return selected


def source_samples(rows: list[dict], count: int) -> list[dict]:
    selected: list[dict] = []
    anomalous_statuses = sorted(
        {row["legacy_extraction_status"] for row in rows}
        - {"", "ok"}
    )
    for status in anomalous_statuses:
        candidates = sorted(
            (row for row in rows if row["legacy_extraction_status"] == status),
            key=lambda row: (row["size_bytes"], row["relative_path"]),
        )
        if candidates and len(selected) < count:
            selected.append(candidates[len(candidates) // 2])
    remaining = [row for row in rows if row not in selected]
    selected.extend(quantile_samples(remaining, count - len(selected)))
    return selected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--measurement", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--sample-count", type=int, default=12)
    args = parser.parse_args()
    if not 10 <= args.sample_count <= 15:
        raise ValueError("PDF canary must contain 10 to 15 samples")
    measurement = json.loads(args.measurement.read_text(encoding="utf-8"))
    rows = measurement["files"]
    sources = sorted({row["source_kind"] for row in rows})
    if len(sources) < 2:
        selected = source_samples(rows, args.sample_count)
    else:
        first_count = args.sample_count // 2
        selected = []
        for index, source in enumerate(sources[:2]):
            count = first_count if index == 0 else args.sample_count - first_count
            selected.extend(
                source_samples(
                    [row for row in rows if row["source_kind"] == source], count
                )
            )
    selected.sort(key=lambda row: row["relative_path"])
    output = {
        "plan_type": "PDF_CANARY_PLAN",
        "measurement_run_id": measurement["measurement_run_id"],
        "sample_count": len(selected),
        "selection_method": "source-balanced size quantiles with distinct owners where possible",
        "samples": [
            {
                key: row[key]
                for key in (
                    "relative_path",
                    "source_kind",
                    "source_owner_id",
                    "file_name",
                    "size_bytes",
                    "sha256",
                    "collected_at_kst",
                    "legacy_extraction_status",
                    "legacy_text_chars",
                    "year_tokens",
                )
            }
            for row in selected
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(
        (json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    )
    print(json.dumps({
        "sample_count": len(selected),
        "source_counts": {
            source: sum(row["source_kind"] == source for row in selected)
            for source in sources
        },
        "size_range": [
            min(row["size_bytes"] for row in selected),
            max(row["size_bytes"] for row in selected),
        ],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
