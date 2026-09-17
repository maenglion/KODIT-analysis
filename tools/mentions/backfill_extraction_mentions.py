"""T03 corpus-wide deterministic mention backfill.

The writer reuses the linked Supabase CLI OAuth path. No PostgreSQL password or
service key is requested. Full extraction text is read from the private core
ledger, mentions are computed locally, and only exact span observations are
written through the service-role-only core.record_extraction_mentions boundary.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import tempfile
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

from mention_extractor import extract_mentions


REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = Path(__file__).with_name("mention-v1.json")
RULE_ARTIFACT_PATH = (
    REPO_ROOT
    / "reports/measurements/2026-09-13-reconstructed-evaluation/reconstructed-evaluation.json"
)
SUPABASE_CLI_PACKAGE = "supabase@2.117.0"
EXPECTED_EXTRACTIONS = 2397
EXPECTED_RULES = 1041
READ_PAGE_SIZE = 100
WRITE_BATCH_ITEMS = 100
WRITE_BATCH_BYTES = 900_000


class MentionBackfillError(RuntimeError):
    """A stop condition in the T03 contract."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def encode_json_sql(value: Any) -> str:
    encoded = base64.b64encode(canonical_json(value)).decode("ascii")
    return f"convert_from(decode('{encoded}', 'base64'), 'UTF8')::jsonb"


def run_supabase_query(sql: str) -> list[dict[str, Any]]:
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", suffix=".sql", delete=False
        ) as handle:
            handle.write(sql)
            temporary_path = Path(handle.name)
        completed = subprocess.run(
            [
                "npx.cmd" if os.name == "nt" else "npx",
                "--yes",
                SUPABASE_CLI_PACKAGE,
                "db",
                "query",
                "--linked",
                "--output-format",
                "json",
                "--file",
                str(temporary_path),
            ],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        if completed.returncode != 0:
            detail = (completed.stderr + "\n" + completed.stdout).strip()
            detail = re.sub(r"(?i)(sbp_|eyJ)[A-Za-z0-9._-]+", "<REDACTED_TOKEN>", detail)
            detail = re.sub(r"(?i)[A-Z]:\\[^\r\n]+", "<REDACTED_PATH>", detail)
            detail = " | ".join(detail.splitlines()[-6:])[:1600]
            raise MentionBackfillError(
                f"Supabase CLI query failed with exit code {completed.returncode}: {detail}"
            )
        response = json.loads(completed.stdout)
        rows = response.get("rows")
        if not isinstance(rows, list):
            raise MentionBackfillError("Supabase CLI response has no rows array")
        return rows
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def read_object(sql: str, column: str) -> dict[str, Any]:
    rows = run_supabase_query(sql)
    if len(rows) != 1 or column not in rows[0]:
        raise MentionBackfillError(f"unexpected query result for {column}")
    value = rows[0][column]
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict):
        raise MentionBackfillError(f"query result {column} is not an object")
    return value


def load_contract() -> tuple[dict[str, Any], list[str], dict[str, str]]:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    artifact = json.loads(RULE_ARTIFACT_PATH.read_text(encoding="utf-8"))
    rule_names = sorted(
        {str(row["regulation_name"]) for row in artifact["evaluations"]}
    )
    if len(rule_names) != EXPECTED_RULES:
        raise MentionBackfillError(
            f"checked-in rule dictionary count {len(rule_names)} != {EXPECTED_RULES}"
        )
    inputs = {
        CONFIG_PATH.relative_to(REPO_ROOT).as_posix(): sha256_file(CONFIG_PATH),
        RULE_ARTIFACT_PATH.relative_to(REPO_ROOT).as_posix(): sha256_file(
            RULE_ARTIFACT_PATH
        ),
        Path(__file__).relative_to(REPO_ROOT).as_posix(): sha256_file(Path(__file__)),
        Path(__file__).with_name("mention_extractor.py").relative_to(REPO_ROOT).as_posix():
            sha256_file(Path(__file__).with_name("mention_extractor.py")),
    }
    return config, rule_names, inputs


def contract_state(require_mention_ledger: bool) -> dict[str, Any]:
    state = read_object(
        """
select json_build_object(
  'database_name', current_database(),
  'mention_ledger_ready', to_regclass('core.extraction_mentions') is not null,
  'mention_migration_count', (
    select count(*) from supabase_migrations.schema_migrations
    where version = '20260917000300'
  ),
  'extractions', (select count(*) from core.document_extractions),
  'source_attachments', (select count(*) from core.source_attachments),
  'attachment_observations', (select count(*) from core.source_attachment_observations),
  'parser_runs', (select count(*) from core.parser_runs),
  'publish_regulations', (
    select count(*) from publish.regulations r join publish.current_release c
      on c.release_id = r.release_id where c.singleton_key
  ),
  'publish_notices', (
    select count(*) from publish.notices n join publish.current_release c
      on c.release_id = n.release_id where c.singleton_key
  ),
  'notice_link_occurrences', (
    select coalesce(sum(cardinality(n.linked_regulation_version_ids)), 0)
    from publish.notices n join publish.current_release c
      on c.release_id = n.release_id where c.singleton_key
  ),
  'notice_residuals', (
    select count(*) from publish.notice_department_residual_occurrences o
    join publish.current_release c on c.release_id = o.release_id where c.singleton_key
  ),
  'legacy_text_count', (select count(*) from core.documents where extracted_text is not null),
  'legacy_text_hash', (
    select md5(coalesce(string_agg(sha256 || ':' || md5(coalesce(extracted_text, '')),
      ',' order by sha256), '')) from core.documents where extracted_text is not null
  )
) as state;
""",
        "state",
    )
    expected = {
        "database_name": "postgres",
        "extractions": 2397,
        "source_attachments": 2414,
        "attachment_observations": 2414,
        "parser_runs": 2414,
        "publish_regulations": 1041,
        "publish_notices": 2089,
        "notice_link_occurrences": 3775,
        "notice_residuals": 1272,
    }
    if require_mention_ledger:
        expected.update({"mention_ledger_ready": True, "mention_migration_count": 1})
    for key, value in expected.items():
        if state.get(key) != value:
            raise MentionBackfillError(
                f"remote contract mismatch: {key}={state.get(key)} expected {value}"
            )
    return state


def remote_rule_names() -> list[str]:
    rows = run_supabase_query(
        "select canonical_name from core.regulations order by canonical_name;"
    )
    names = [str(row["canonical_name"]) for row in rows]
    if len(names) != EXPECTED_RULES or len(set(names)) != EXPECTED_RULES:
        raise MentionBackfillError("core.regulations lexical dictionary is not 1,041 unique rows")
    return names


def fetch_extractions() -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    cursor = "00000000-0000-0000-0000-000000000000"
    while True:
        rows = run_supabase_query(
            f"""
select extraction_id::text, extract_hash, extraction_contract_version,
       extracted_text, extracted_char_count
from core.document_extractions
where extraction_id > '{cursor}'::uuid
order by extraction_id
limit {READ_PAGE_SIZE};
"""
        )
        if not rows:
            break
        result.extend(rows)
        cursor = str(rows[-1]["extraction_id"])
    if len(result) != EXPECTED_EXTRACTIONS:
        raise MentionBackfillError(
            f"extraction population {len(result)} != {EXPECTED_EXTRACTIONS}"
        )
    return result


def deterministic_mention_id(
    extraction_id: str,
    contract_version: str,
    mention_type: str,
    span_start: int,
    span_end: int,
) -> str:
    value = (
        "kodit:core:extraction-mention:"
        f"{extraction_id}:{contract_version}:{mention_type}:{span_start}:{span_end}"
    )
    return str(uuid.UUID(hashlib.md5(value.encode("utf-8")).hexdigest()))


def compute_mentions(
    extractions: list[dict[str, Any]],
    config: dict[str, Any],
    rule_names: list[str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    payloads: list[dict[str, Any]] = []
    type_occurrences: Counter[str] = Counter()
    type_raw: dict[str, set[str]] = defaultdict(set)
    type_extractions: dict[str, set[str]] = defaultdict(set)
    rule_counts: Counter[str] = Counter()
    zero_mentions = 0
    span_failures = 0
    contract_version = config["mention_contract_version"]
    for extraction in extractions:
        text = str(extraction["extracted_text"])
        if len(text) != int(extraction["extracted_char_count"]):
            raise MentionBackfillError("input extraction character count mismatch")
        if sha256_bytes(text.encode("utf-8")) != str(extraction["extract_hash"]):
            raise MentionBackfillError("input extraction hash mismatch")
        mentions = extract_mentions(text, config, rule_names)
        for mention in mentions:
            if text[mention["span_start"] : mention["span_end"]] != mention["raw_text"]:
                span_failures += 1
            mention["mention_id"] = deterministic_mention_id(
                str(extraction["extraction_id"]),
                contract_version,
                mention["mention_type"],
                mention["span_start"],
                mention["span_end"],
            )
            type_occurrences[mention["mention_type"]] += 1
            type_raw[mention["mention_type"]].add(mention["raw_text"])
            type_extractions[mention["mention_type"]].add(
                str(extraction["extraction_id"])
            )
            rule_counts[mention["extractor_rule"]] += 1
        if not mentions:
            zero_mentions += 1
        payloads.append(
            {
                "extraction_id": str(extraction["extraction_id"]),
                "mentions": [
                    {key: value for key, value in mention.items() if key != "mention_id"}
                    for mention in mentions
                ],
                "mention_ids": [mention["mention_id"] for mention in mentions],
            }
        )
    if span_failures:
        raise MentionBackfillError(f"local span failures: {span_failures}")
    all_mentions = [mention for payload in payloads for mention in payload["mentions"]]
    stats = {
        "total_extractions": len(extractions),
        "total_mentions": len(all_mentions),
        "zero_mention_extractions": zero_mentions,
        "by_mention_type": {
            mention_type: {
                "occurrence_count": type_occurrences[mention_type],
                "distinct_raw_text_count": len(type_raw[mention_type]),
                "extraction_count": len(type_extractions[mention_type]),
            }
            for mention_type in ("PERSON", "ORG", "RULE", "WORK", "EMAIL")
        },
        "by_extractor_rule": dict(sorted(rule_counts.items())),
        "span_validation_failures": span_failures,
    }
    return payloads, stats


def iter_write_batches(payloads: Iterable[dict[str, Any]]) -> Iterable[list[dict[str, Any]]]:
    batch: list[dict[str, Any]] = []
    size = 2
    for payload in payloads:
        transport = {
            "extraction_id": payload["extraction_id"],
            "mentions": payload["mentions"],
        }
        item_size = len(canonical_json(transport)) + 1
        if item_size > WRITE_BATCH_BYTES:
            raise MentionBackfillError("one extraction mention payload exceeds safety limit")
        if batch and (
            len(batch) >= WRITE_BATCH_ITEMS or size + item_size > WRITE_BATCH_BYTES
        ):
            yield batch
            batch = []
            size = 2
        batch.append(transport)
        size += item_size
    if batch:
        yield batch


def apply_batch(
    payload: list[dict[str, Any]], contract_version: str, extractor_version: str
) -> int:
    encoded = encode_json_sql(payload)
    rows = run_supabase_query(
        f"""
begin;
set local role service_role;
with payload as (
  select value p from jsonb_array_elements({encoded})
), inserted as (
  select core.record_extraction_mentions(
    (p->>'extraction_id')::uuid,
    '{contract_version}',
    '{extractor_version}',
    p->'mentions'
  ) inserted_count
  from payload
)
select coalesce(sum(inserted_count), 0)::integer as inserted_count from inserted;
commit;
"""
    )
    if len(rows) != 1:
        raise MentionBackfillError("unexpected mention write acknowledgement")
    return int(rows[0]["inserted_count"])


def fetch_existing(contract_version: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    cursor = "00000000-0000-0000-0000-000000000000"
    while True:
        rows = run_supabase_query(
            f"""
select mention_id::text, extraction_id::text, mention_type, span_start, span_end,
       raw_text, extractor_rule, extractor_version, evidence_metadata
from core.extraction_mentions
where mention_contract_version = '{contract_version}'
  and mention_id > '{cursor}'::uuid
order by mention_id
limit 1000;
"""
        )
        if not rows:
            break
        result.extend(rows)
        cursor = str(rows[-1]["mention_id"])
    return result


def expected_rows(
    payloads: list[dict[str, Any]], config: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for payload in payloads:
        for mention, mention_id in zip(payload["mentions"], payload["mention_ids"]):
            result[mention_id] = {
                "mention_id": mention_id,
                "extraction_id": payload["extraction_id"],
                "mention_type": mention["mention_type"],
                "span_start": mention["span_start"],
                "span_end": mention["span_end"],
                "raw_text": mention["raw_text"],
                "extractor_rule": mention["extractor_rule"],
                "extractor_version": config["extractor_version"],
                "evidence_metadata": mention["evidence_metadata"],
            }
    return result


def compare_existing(
    expected: Mapping[str, dict[str, Any]], existing: Iterable[dict[str, Any]]
) -> dict[str, int]:
    actual = {str(row["mention_id"]): row for row in existing}
    changed = 0
    for mention_id in expected.keys() & actual.keys():
        left = canonical_json(expected[mention_id])
        right = canonical_json(actual[mention_id])
        if left != right:
            changed += 1
    return {
        "expected_mentions": len(expected),
        "existing_mentions": len(actual),
        "new_mentions": len(expected.keys() - actual.keys()),
        "unexpected_mentions": len(actual.keys() - expected.keys()),
        "changed_mentions": changed,
    }


def validate_remote(contract_version: str) -> dict[str, Any]:
    return read_object(
        f"""
select json_build_object(
  'mentions', count(*),
  'span_validation_failures', count(*) filter (
    where m.raw_text <> substring(e.extracted_text from m.span_start + 1 for m.span_end - m.span_start)
  ),
  'broken_extraction_fk', count(*) filter (where e.extraction_id is null),
  'duplicate_deterministic_keys', (
    select count(*) from (
      select extraction_id, mention_contract_version, mention_type, span_start, span_end
      from core.extraction_mentions where mention_contract_version = '{contract_version}'
      group by 1,2,3,4,5 having count(*) > 1
    ) d
  ),
  'unknown_mention_type', count(*) filter (
    where m.mention_type not in ('PERSON','ORG','RULE','WORK','EMAIL')
  ),
  'unknown_contract_version', count(*) filter (
    where m.mention_contract_version <> '{contract_version}'
  ),
  'rollup_mentions', count(*) filter (
    where exists (
      select 1 from core.parser_runs pr
      join core.source_attachment_observations sao
        on sao.attachment_observation_id = pr.attachment_observation_id
      join core.source_attachments sa on sa.attachment_id = sao.attachment_id
      join core.source_records sr on sr.source_record_id = sa.source_record_id
      where pr.extraction_id = m.extraction_id
    )
  ),
  'rollup_extractions', count(distinct m.extraction_id) filter (
    where exists (select 1 from core.parser_runs pr where pr.extraction_id = m.extraction_id)
  )
) as validation
from core.extraction_mentions m
left join core.document_extractions e on e.extraction_id = m.extraction_id
where m.mention_contract_version = '{contract_version}';
""",
        "validation",
    )


def write_summary(path: Path, summary: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("preflight", "apply", "dry-run"), default="preflight")
    parser.add_argument("--summary", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    started_at = utc_now()
    config, checked_in_rule_names, input_hashes = load_contract()
    require_ledger = args.mode in ("apply", "dry-run")
    before = contract_state(require_ledger)
    db_rule_names = remote_rule_names()
    if set(db_rule_names) != set(checked_in_rule_names):
        raise MentionBackfillError(
            "core.regulations names differ from checked-in 1,041-name reproduction source"
        )
    extractions = fetch_extractions()
    payloads, stats = compute_mentions(extractions, config, checked_in_rule_names)
    expected = expected_rows(payloads, config)
    existing = fetch_existing(config["mention_contract_version"]) if require_ledger else []
    before_compare = compare_existing(expected, existing)
    if before_compare["unexpected_mentions"] or before_compare["changed_mentions"]:
        raise MentionBackfillError("existing mention-v1 rows disagree with deterministic output")

    inserted = 0
    if args.mode == "apply":
        for batch in iter_write_batches(payloads):
            inserted += apply_batch(
                batch,
                config["mention_contract_version"],
                config["extractor_version"],
            )

    after_existing = fetch_existing(config["mention_contract_version"]) if require_ledger else []
    after_compare = compare_existing(expected, after_existing)
    if require_ledger and any(
        after_compare[key]
        for key in ("new_mentions", "unexpected_mentions", "changed_mentions")
    ):
        raise MentionBackfillError("persisted mention set does not match deterministic output")
    validation = validate_remote(config["mention_contract_version"]) if require_ledger else {}
    after = contract_state(require_ledger)
    protected_keys = (
        "extractions", "source_attachments", "attachment_observations", "parser_runs",
        "publish_regulations", "publish_notices", "notice_link_occurrences",
        "notice_residuals", "legacy_text_count", "legacy_text_hash",
    )
    protected_unchanged = all(before[key] == after[key] for key in protected_keys)
    if not protected_unchanged:
        raise MentionBackfillError("protected T01/T02/publish state changed")

    summary = {
        "mention_contract_version": config["mention_contract_version"],
        "extractor_version": config["extractor_version"],
        "mode": args.mode,
        "writer": "supabase-cli-linked-oauth" if require_ledger else "read-only",
        "started_at": started_at,
        "finished_at": utc_now(),
        "rule_dictionary": {
            "canonical_source": "core.regulations.canonical_name",
            "count": len(db_rule_names),
            "snapshot_sha256": sha256_bytes(canonical_json(checked_in_rule_names)),
        },
        "results": stats,
        "persistence": {
            "inserted_mentions": inserted,
            "before": before_compare,
            "after": after_compare,
        },
        "validation": validation,
        "protected_state_unchanged": protected_unchanged,
        "input_artifact_sha256": input_hashes,
        "label_or_entity_created": False,
        "public_or_ui_changed": False,
    }
    if args.summary:
        write_summary(args.summary, summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
