"""T04 deterministic lexical-label backfill via linked Supabase CLI OAuth."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import tempfile
import unicodedata
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

REPO_ROOT = Path(__file__).resolve().parents[2]
SUPABASE_CLI_PACKAGE = "supabase@2.117.0"
LABEL_CONTRACT_VERSION = "label-v1"
EXPECTED_MENTIONS = 20_937
EXPECTED_RESIDUALS = 1_272
EXPECTED_RESIDUAL_RAW_LABELS = 355
READ_PAGE_SIZE = 1_000
WRITE_BATCH_ITEMS = 4_000


class LabelBackfillError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def normalize_label_v1(raw: str) -> str:
    normalized = re.sub(r"\s+", " ", unicodedata.normalize("NFC", raw).strip())
    if not normalized:
        raise LabelBackfillError("label-v1 produced an empty label")
    return normalized


def deterministic_label_id(normalized_label: str) -> str:
    seed = f"kodit:core:lexical-label:{LABEL_CONTRACT_VERSION}:{normalized_label}"
    return str(uuid.UUID(hashlib.md5(seed.encode("utf-8")).hexdigest()))


def encode_json_sql(value: Any) -> str:
    encoded = base64.b64encode(canonical_json(value)).decode("ascii")
    return f"convert_from(decode('{encoded}', 'base64'), 'UTF8')::jsonb"


def run_supabase_query(sql: str) -> list[dict[str, Any]]:
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".sql", delete=False) as handle:
            handle.write(sql)
            temporary_path = Path(handle.name)
        completed = subprocess.run(
            ["npx.cmd" if os.name == "nt" else "npx", "--yes", SUPABASE_CLI_PACKAGE,
             "db", "query", "--linked", "--output-format", "json", "--file", str(temporary_path)],
            cwd=REPO_ROOT, check=False, capture_output=True, text=True, encoding="utf-8",
        )
        if completed.returncode != 0:
            detail = (completed.stderr + "\n" + completed.stdout).strip()
            detail = re.sub(r"(?i)(sbp_|eyJ)[A-Za-z0-9._-]+", "<REDACTED_TOKEN>", detail)
            detail = re.sub(r"(?i)[A-Z]:\\[^\r\n]+", "<REDACTED_PATH>", detail)
            raise LabelBackfillError("Supabase CLI query failed: " + " | ".join(detail.splitlines()[-8:])[:2000])
        rows = json.loads(completed.stdout).get("rows")
        if not isinstance(rows, list):
            raise LabelBackfillError("Supabase CLI response has no rows array")
        return rows
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def read_object(sql: str, column: str) -> dict[str, Any]:
    rows = run_supabase_query(sql)
    if len(rows) != 1 or column not in rows[0]:
        raise LabelBackfillError(f"unexpected query result for {column}")
    value = rows[0][column]
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict):
        raise LabelBackfillError(f"{column} is not an object")
    return value


def contract_state(require_ledger: bool) -> dict[str, Any]:
    state = read_object("""
select json_build_object(
  'label_ledger_ready', to_regclass('core.labels') is not null,
  'label_migration_count', (select count(*) from supabase_migrations.schema_migrations where version='20260918000100'),
  'publish_regulations', (select count(*) from publish.regulations r join publish.current_release c on c.release_id=r.release_id where c.singleton_key),
  'publish_notices', (select count(*) from publish.notices n join publish.current_release c on c.release_id=n.release_id where c.singleton_key),
  'notice_link_occurrences', (select coalesce(sum(cardinality(n.linked_regulation_version_ids)),0) from publish.notices n join publish.current_release c on c.release_id=n.release_id where c.singleton_key),
  'notice_residuals', (select count(*) from publish.notice_department_residual_occurrences r join publish.current_release c on c.release_id=r.release_id where c.singleton_key),
  'source_attachments', (select count(*) from core.source_attachments),
  'attachment_observations', (select count(*) from core.source_attachment_observations),
  'parser_runs', (select count(*) from core.parser_runs),
  'extractions', (select count(*) from core.document_extractions),
  'mentions', (select count(*) from core.extraction_mentions),
  'mention_hash', (select md5(coalesce(string_agg(mention_id::text||':'||raw_text,',' order by mention_id),'')) from core.extraction_mentions),
  'residual_hash', (select md5(coalesce(string_agg(r.residual_id::text||':'||r.raw_label,',' order by r.residual_id),'')) from publish.notice_department_residual_occurrences r join publish.current_release c on c.release_id=r.release_id where c.singleton_key)
) as state;
""", "state")
    expected = {
        "publish_regulations": 1041, "publish_notices": 2089,
        "notice_link_occurrences": 3775, "notice_residuals": EXPECTED_RESIDUALS,
        "source_attachments": 2414, "attachment_observations": 2414,
        "parser_runs": 2414, "extractions": 2397, "mentions": EXPECTED_MENTIONS,
    }
    if require_ledger:
        expected.update({"label_ledger_ready": True, "label_migration_count": 1})
    for key, value in expected.items():
        if state.get(key) != value:
            raise LabelBackfillError(f"remote contract mismatch: {key}={state.get(key)} expected {value}")
    return state


def fetch_mentions() -> list[dict[str, Any]]:
    result = run_supabase_query(
        "select mention_id::text,raw_text,mention_type "
        "from core.extraction_mentions order by mention_id;"
    )
    if len(result) != EXPECTED_MENTIONS:
        raise LabelBackfillError(f"mention population {len(result)} != {EXPECTED_MENTIONS}")
    return result


def fetch_residuals() -> list[dict[str, Any]]:
    result = run_supabase_query("""
select r.residual_id::text,r.raw_label
from publish.notice_department_residual_occurrences r
join publish.current_release c on c.release_id=r.release_id
where c.singleton_key order by r.residual_id;
""")
    if len(result) != EXPECTED_RESIDUALS:
        raise LabelBackfillError(f"residual population {len(result)} != {EXPECTED_RESIDUALS}")
    if len({str(row["raw_label"]) for row in result}) != EXPECTED_RESIDUAL_RAW_LABELS:
        raise LabelBackfillError("T01 distinct raw-label count is not 355")
    return result


def build_expected(mentions: list[dict[str, Any]], residuals: list[dict[str, Any]]) -> dict[str, Any]:
    labels: dict[str, dict[str, str]] = {}
    mention_links: dict[str, dict[str, str]] = {}
    residual_links: dict[str, dict[str, str]] = {}
    for row in mentions:
        normalized = normalize_label_v1(str(row["raw_text"]))
        label_id = deterministic_label_id(normalized)
        labels[label_id] = {"label_id": label_id, "normalized_label": normalized}
        mention_id = str(row["mention_id"])
        mention_links[mention_id] = {"mention_id": mention_id, "label_id": label_id, "normalized_label": normalized}
    for row in residuals:
        normalized = normalize_label_v1(str(row["raw_label"]))
        label_id = deterministic_label_id(normalized)
        labels[label_id] = {"label_id": label_id, "normalized_label": normalized}
        residual_id = str(row["residual_id"])
        residual_links[residual_id] = {"residual_id": residual_id, "label_id": label_id, "normalized_label": normalized}
    return {"labels": labels, "mention_links": mention_links, "residual_links": residual_links}


def batches(items: list[dict[str, str]]) -> Iterable[list[dict[str, str]]]:
    for index in range(0, len(items), WRITE_BATCH_ITEMS):
        yield items[index:index + WRITE_BATCH_ITEMS]


def apply_payload(labels: list[dict[str, str]], mentions: list[dict[str, str]], residuals: list[dict[str, str]]) -> dict[str, int]:
    rows = run_supabase_query(f"""
begin;
set local role service_role;
select core.record_lexical_label_links('{LABEL_CONTRACT_VERSION}',{encode_json_sql(labels)},{encode_json_sql(mentions)},{encode_json_sql(residuals)}) as result;
commit;
""")
    value = rows[0]["result"]
    if isinstance(value, str):
        value = json.loads(value)
    return {key: int(value[key]) for key in ("labels", "mention_links", "residual_links")}


def apply_expected(expected: Mapping[str, Any]) -> dict[str, int]:
    inserted: Counter[str] = Counter()
    for batch in batches(list(expected["labels"].values())):
        inserted.update(apply_payload(batch, [], []))
    for batch in batches(list(expected["mention_links"].values())):
        inserted.update(apply_payload([], batch, []))
    for batch in batches(list(expected["residual_links"].values())):
        inserted.update(apply_payload([], [], batch))
    return {key: inserted[key] for key in ("labels", "mention_links", "residual_links")}


def fetch_existing() -> dict[str, dict[str, dict[str, str]]]:
    output: dict[str, dict[str, dict[str, str]]] = {"labels": {}, "mention_links": {}, "residual_links": {}}
    definitions = (
        ("labels", "core.labels", "label_id", "label_id::text,normalized_label"),
        ("mention_links", "core.extraction_mention_labels", "mention_id", "mention_id::text,label_id::text"),
        ("residual_links", "core.notice_department_residual_labels", "residual_id", "residual_id::text,label_id::text"),
    )
    for name, table, key, columns in definitions:
        rows = run_supabase_query(
            f"select {columns} from {table} "
            f"where label_contract_version='{LABEL_CONTRACT_VERSION}' order by {key};"
        )
        for row in rows:
            output[name][str(row[key])] = {
                field: str(value) for field, value in row.items()
            }
    return output


def compare_expected(expected: Mapping[str, Any], existing: Mapping[str, Any]) -> dict[str, int]:
    result: dict[str, int] = {}
    for name in ("labels", "mention_links", "residual_links"):
        wanted, actual = expected[name], existing[name]
        result[f"expected_{name}"] = len(wanted)
        result[f"existing_{name}"] = len(actual)
        result[f"missing_{name}"] = len(wanted.keys() - actual.keys())
        result[f"unexpected_{name}"] = len(actual.keys() - wanted.keys())
        result[f"changed_{name}"] = sum(
            1 for key in wanted.keys() & actual.keys()
            if (wanted[key]["normalized_label"] != actual[key]["normalized_label"] if name == "labels" else wanted[key]["label_id"] != actual[key]["label_id"])
        )
    return result


def validate_remote() -> dict[str, Any]:
    return read_object(f"""
with residual_labels as (
  select distinct rl.label_id from core.notice_department_residual_labels rl
  join publish.notice_department_residual_occurrences r on r.residual_id=rl.residual_id
  join publish.current_release c on c.release_id=r.release_id
  where c.singleton_key and rl.label_contract_version='{LABEL_CONTRACT_VERSION}'
), type_distribution as (
  select resolved_label_type,count(*) n from core.label_type_evidence
  where label_contract_version='{LABEL_CONTRACT_VERSION}' group by resolved_label_type
), residual_types as (
  select t.resolved_label_type,count(*) n from residual_labels r
  join core.label_type_evidence t on t.label_id=r.label_id and t.label_contract_version='{LABEL_CONTRACT_VERSION}'
  group by t.resolved_label_type
), variant_distribution as (
  select distinct_raw_variant_count,count(*) n from core.label_metrics
  where label_contract_version='{LABEL_CONTRACT_VERSION}' group by distinct_raw_variant_count
), date_observations as (
  select distinct ml.label_id,m.mention_id::text||':'||sr.source_record_id::text observation_key,
         s.source_code,sr.published_at observed_at
  from core.extraction_mention_labels ml join core.extraction_mentions m on m.mention_id=ml.mention_id
  join core.parser_runs pr on pr.extraction_id=m.extraction_id
  join core.source_attachment_observations sao on sao.attachment_observation_id=pr.attachment_observation_id
  join core.source_attachments sa on sa.attachment_id=sao.attachment_id
  join core.source_records sr on sr.source_record_id=sa.source_record_id join core.sources s on s.source_id=sr.source_id
  where ml.label_contract_version='{LABEL_CONTRACT_VERSION}'
  union
  select rl.label_id,r.residual_id::text,'kodit-notice-residual',r.posted_at
  from core.notice_department_residual_labels rl
  join publish.notice_department_residual_occurrences r on r.residual_id=rl.residual_id
  join publish.current_release c on c.release_id=r.release_id
  where c.singleton_key and rl.label_contract_version='{LABEL_CONTRACT_VERSION}'
)
select json_build_object(
 'labels',(select count(*) from core.labels where label_contract_version='{LABEL_CONTRACT_VERSION}'),
 'mention_links',(select count(*) from core.extraction_mention_labels where label_contract_version='{LABEL_CONTRACT_VERSION}'),
 'residual_links',(select count(*) from core.notice_department_residual_labels where label_contract_version='{LABEL_CONTRACT_VERSION}'),
 'broken_label_fk',(select count(*) from (
   select ml.label_id from core.extraction_mention_labels ml left join core.labels l on l.label_id=ml.label_id and l.label_contract_version=ml.label_contract_version where ml.label_contract_version='{LABEL_CONTRACT_VERSION}' and l.label_id is null
   union all select rl.label_id from core.notice_department_residual_labels rl left join core.labels l on l.label_id=rl.label_id and l.label_contract_version=rl.label_contract_version where rl.label_contract_version='{LABEL_CONTRACT_VERSION}' and l.label_id is null
 ) x),
 'duplicate_mappings',(select count(*) from (
   select mention_id from core.extraction_mention_labels where label_contract_version='{LABEL_CONTRACT_VERSION}' group by mention_id having count(*)>1
   union all select residual_id from core.notice_department_residual_labels where label_contract_version='{LABEL_CONTRACT_VERSION}' group by residual_id having count(*)>1
 ) x),
 'invalid_normalized_label',(select count(*) from core.labels where label_contract_version='{LABEL_CONTRACT_VERSION}' and (normalized_label='' or normalized_label<>core.normalize_label_v1(normalized_label))),
 'unknown_contract',(select count(*) from core.labels where label_contract_version<>'{LABEL_CONTRACT_VERSION}'),
 'label_id_mismatch',(select count(*) from core.labels where label_contract_version='{LABEL_CONTRACT_VERSION}' and label_id<>core.lexical_label_id(label_contract_version,normalized_label)),
 'type_distribution',(select coalesce(json_object_agg(resolved_label_type,n),'{{}}'::json) from type_distribution),
 'residual_lexical_labels',(select count(*) from residual_labels),
 'residual_type_distribution',(select coalesce(json_object_agg(resolved_label_type,n),'{{}}'::json) from residual_types),
 'metric_sums',(select json_build_object(
   'mention_occurrences',sum(mention_occurrence_count),'residual_occurrences',sum(department_residual_occurrence_count),
   'first_seen_at',min(first_seen_at),'last_seen_at',max(last_seen_at),
   'labels_with_dates',count(*) filter(where first_seen_at is not null),
   'labels_without_dates',count(*) filter(where first_seen_at is null)
 ) from core.label_metrics where label_contract_version='{LABEL_CONTRACT_VERSION}'),
 'distinct_extractions',(select count(distinct m.extraction_id) from core.extraction_mention_labels ml join core.extraction_mentions m on m.mention_id=ml.mention_id where ml.label_contract_version='{LABEL_CONTRACT_VERSION}'),
 'distinct_core_source_records',(select count(distinct sr.source_record_id) from core.extraction_mention_labels ml join core.extraction_mentions m on m.mention_id=ml.mention_id join core.parser_runs pr on pr.extraction_id=m.extraction_id join core.source_attachment_observations sao on sao.attachment_observation_id=pr.attachment_observation_id join core.source_attachments sa on sa.attachment_id=sao.attachment_id join core.source_records sr on sr.source_record_id=sa.source_record_id where ml.label_contract_version='{LABEL_CONTRACT_VERSION}'),
 'distinct_source_records',(select count(distinct source_record_key) from (
   select s.source_code||':'||coalesce(sr.external_key,sr.source_record_id::text) source_record_key from core.extraction_mention_labels ml join core.extraction_mentions m on m.mention_id=ml.mention_id join core.parser_runs pr on pr.extraction_id=m.extraction_id join core.source_attachment_observations sao on sao.attachment_observation_id=pr.attachment_observation_id join core.source_attachments sa on sa.attachment_id=sao.attachment_id join core.source_records sr on sr.source_record_id=sa.source_record_id join core.sources s on s.source_id=sr.source_id where ml.label_contract_version='{LABEL_CONTRACT_VERSION}'
   union select 'kodit-preannouncement-preserved:'||n.notice_number from core.notice_department_residual_labels rl join publish.notice_department_residual_occurrences r on r.residual_id=rl.residual_id join publish.notices n on n.release_id=r.release_id and n.notice_id=r.notice_id join publish.current_release c on c.release_id=r.release_id where c.singleton_key and rl.label_contract_version='{LABEL_CONTRACT_VERSION}'
 ) x),
 'distinct_kodit_notices',(select count(distinct source_record_key) from (
   select 'KODIT:'||sr.external_key source_record_key from core.extraction_mention_labels ml join core.extraction_mentions m on m.mention_id=ml.mention_id join core.parser_runs pr on pr.extraction_id=m.extraction_id join core.source_attachment_observations sao on sao.attachment_observation_id=pr.attachment_observation_id join core.source_attachments sa on sa.attachment_id=sao.attachment_id join core.source_records sr on sr.source_record_id=sa.source_record_id join core.sources s on s.source_id=sr.source_id where ml.label_contract_version='{LABEL_CONTRACT_VERSION}' and s.source_code='kodit-preannouncement-preserved'
   union select 'KODIT:'||n.notice_number from core.notice_department_residual_labels rl join publish.notice_department_residual_occurrences r on r.residual_id=rl.residual_id join publish.notices n on n.release_id=r.release_id and n.notice_id=r.notice_id join publish.current_release c on c.release_id=r.release_id where c.singleton_key and rl.label_contract_version='{LABEL_CONTRACT_VERSION}'
 ) x),
 'raw_variant_distribution',(select coalesce(json_object_agg(distinct_raw_variant_count,n),'{{}}'::json) from variant_distribution),
 'date_coverage',(select json_object_agg(source_code,json_build_object('observations',observations,'dated',dated,'null',observations-dated)) from (select source_code,count(*) observations,count(*) filter(where observed_at is not null) dated from date_observations group by source_code order by source_code) x),
 'date_order_errors',(select count(*) from core.label_metrics where label_contract_version='{LABEL_CONTRACT_VERSION}' and first_seen_at>last_seen_at),
 'parser_timestamp_source_dates',0
) as validation;
""", "validation")


def write_summary(path: Path, summary: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("preflight", "apply", "dry-run"), default="preflight")
    parser.add_argument("--summary", type=Path)
    args = parser.parse_args()
    require_ledger = args.mode in ("apply", "dry-run")
    started_at = utc_now()
    before = contract_state(require_ledger)
    mentions, residuals = fetch_mentions(), fetch_residuals()
    expected = build_expected(mentions, residuals)
    empty = {"labels": {}, "mention_links": {}, "residual_links": {}}
    existing = fetch_existing() if require_ledger else empty
    before_compare = compare_expected(expected, existing)
    if any(before_compare[k] for k in before_compare if k.startswith(("unexpected_", "changed_"))):
        raise LabelBackfillError("existing label-v1 state disagrees with deterministic output")
    inserted = {"labels": 0, "mention_links": 0, "residual_links": 0}
    if args.mode == "apply":
        pending = {
            name: {
                key: value for key, value in expected[name].items()
                if key not in existing[name]
            }
            for name in ("labels", "mention_links", "residual_links")
        }
        inserted = apply_expected(pending)
    after_existing = fetch_existing() if require_ledger else existing
    after_compare = compare_expected(expected, after_existing)
    if require_ledger and any(after_compare[k] for k in after_compare if k.startswith(("missing_", "unexpected_", "changed_"))):
        raise LabelBackfillError("persisted label-v1 state does not match deterministic output")
    validation = validate_remote() if require_ledger else {}
    after = contract_state(require_ledger)
    protected = ("publish_regulations","publish_notices","notice_link_occurrences","notice_residuals","source_attachments","attachment_observations","parser_runs","extractions","mentions","mention_hash","residual_hash")
    protected_unchanged = all(before[k] == after[k] for k in protected)
    if not protected_unchanged:
        raise LabelBackfillError("protected T01/T02/T03/publish state changed")
    population = {"labels": len(expected["labels"]), "mention_links": len(expected["mention_links"]), "residual_links": len(expected["residual_links"])}
    population["identity_sha256"] = hashlib.sha256(canonical_json(expected)).hexdigest()
    summary = {
        "label_contract_version": LABEL_CONTRACT_VERSION, "mode": args.mode,
        "writer": "supabase-cli-linked-oauth" if require_ledger else "read-only",
        "started_at": started_at, "finished_at": utc_now(),
        "input_counts": {"mentions": len(mentions), "residuals": len(residuals)},
        "deterministic_population": population,
        "persistence": {"inserted": inserted, "before": before_compare, "after": after_compare},
        "validation": validation, "protected_state_unchanged": protected_unchanged,
        "person_role_created": False, "entity_or_org_node_created": False,
        "publish_or_ui_changed": False,
    }
    if args.summary:
        write_summary(args.summary, summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
