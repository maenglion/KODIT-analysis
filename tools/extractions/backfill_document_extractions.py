"""T02-C: persist the preserved 2,414-document corpus extraction ledger.

Inputs are deliberately split between checked-in measurement manifests and the
preserved corpus snapshot.  No network request is made.  Source identities are
resolved as follows:

* KODIT: ``post_number + evidence_file_key``
* ALIO: ``rule_id + file_no``

The three checked-in runtime-v1 manifests define the population and baseline
SHA-256 values.  ``download_manifest.json`` supplies the source attachment and
observation metadata.  Source snapshots supply source-record titles/dates/URLs.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping

import psycopg


REPO_ROOT = Path(__file__).resolve().parents[2]
COLLECTOR_DIR = REPO_ROOT / "workers" / "collector"
if str(COLLECTOR_DIR) not in sys.path:
    sys.path.insert(0, str(COLLECTOR_DIR))

import hwp_parser_runner  # noqa: E402
import hwpx_parser_runner  # noqa: E402
import pdf_parser_runner  # noqa: E402


BACKFILL_CONTRACT_VERSION = "t02c-v1.0"
EXPECTED_COUNTS = {"HWP": 326, "HWPX": 358, "PDF": 1730}
EXPECTED_POPULATION = sum(EXPECTED_COUNTS.values())
DATABASE_URL_ENV = "KODIT_TEST_DATABASE_URL"
CORPUS_ROOT_ENV = "KODIT_PRESERVED_CORPUS_ROOT"
SUPABASE_CLI_PACKAGE = "supabase@2.117.0"
CLI_BATCH_SIZE = 50
CLI_BATCH_PAYLOAD_BYTES = 900_000
LOCK_PATH = COLLECTOR_DIR / "requirements.txt"
MEASUREMENT_PATHS = {
    "HWP": REPO_ROOT
    / "reports/measurements/2026-09-13-runtime-v1-reproduction/hwp/batch-run.json",
    "HWPX": REPO_ROOT
    / "reports/measurements/2026-09-13-runtime-v1-reproduction/hwpx/batch-run.json",
    "PDF": REPO_ROOT
    / "reports/measurements/2026-09-13-pdf-full-corpus/batch-run.json",
}
SOURCE_CODES = {
    "kodit": {
        "source_code": "kodit-preannouncement-preserved",
        "name": "KODIT preserved preannouncement corpus",
        "source_type": "preserved_official_preannouncement",
        "base_url": "https://www.kodit.or.kr",
    },
    "alio": {
        "source_code": "alio-internal-rules-preserved",
        "name": "ALIO preserved internal-rules corpus",
        "source_type": "preserved_official_internal_rules",
        "base_url": "https://www.alio.go.kr",
    },
}


class BackfillContractError(RuntimeError):
    """A stop condition in the T02-C contract."""


@dataclass(frozen=True)
class CorpusItem:
    format: str
    relative_path: str
    source_kind: str
    owner_id: str
    attachment_key: str
    file_name: str
    download_url: str
    final_url: str
    content_type: str | None
    size_bytes: int
    sha256: str
    collected_at: str
    source_title: str
    source_date: str | None
    source_page_url: str
    regulation_name: str
    aliases: tuple[str, ...]


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


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def normalized_date(value: str | None) -> str | None:
    if not value:
        return None
    return value.replace(".", "-")


def relative_path_for_download(row: Mapping[str, Any]) -> str:
    suffix = Path(str(row["path"])).suffix.lower()
    return PurePosixPath(
        str(row["kind"]), str(row["owner_id"]), f"{row['key']}{suffix}"
    ).as_posix()


def load_population(corpus_root: Path) -> tuple[list[CorpusItem], dict[str, str]]:
    data_dir = corpus_root / "data"
    downloads = corpus_root / "downloads"
    required = [
        data_dir / "download_manifest.json",
        data_dir / "current_alio_rules_205.json",
        data_dir / "current_preannouncements_2089.json",
        *MEASUREMENT_PATHS.values(),
    ]
    missing = [str(path.name) for path in required if not path.is_file()]
    if missing or not downloads.is_dir():
        raise BackfillContractError(
            "preserved corpus root is incomplete: " + ", ".join(missing or ["downloads"])
        )

    download_rows = load_json(data_dir / "download_manifest.json")
    download_by_path: dict[str, Mapping[str, Any]] = {}
    for row in download_rows:
        relative = relative_path_for_download(row)
        if relative in download_by_path:
            raise BackfillContractError(f"duplicate download identity: {relative}")
        download_by_path[relative] = row

    alio_by_id = {
        str(row["rule_id"]): row
        for row in load_json(data_dir / "current_alio_rules_205.json")
    }
    kodit_by_id = {
        str(row["number"]): row
        for row in load_json(data_dir / "current_preannouncements_2089.json")
    }

    items: list[CorpusItem] = []
    input_hashes: dict[str, str] = {}
    seen_paths: set[str] = set()
    for format_name, measurement_path in MEASUREMENT_PATHS.items():
        measurement = load_json(measurement_path)
        results = measurement.get("results", [])
        if len(results) != EXPECTED_COUNTS[format_name]:
            raise BackfillContractError(
                f"{format_name} population mismatch: {len(results)} != "
                f"{EXPECTED_COUNTS[format_name]}"
            )
        input_hashes[measurement_path.relative_to(REPO_ROOT).as_posix()] = sha256_file(
            measurement_path
        )
        for result in results:
            relative = PurePosixPath(str(result["relative_path"])).as_posix()
            if relative in seen_paths:
                raise BackfillContractError(f"duplicate corpus relative path: {relative}")
            seen_paths.add(relative)
            download = download_by_path.get(relative)
            if download is None:
                raise BackfillContractError(f"source metadata unresolved: {relative}")
            source_kind = str(download["kind"])
            owner_id = str(download["owner_id"])
            if source_kind == "kodit":
                source = kodit_by_id.get(owner_id)
                if source is None:
                    raise BackfillContractError(f"KODIT source record unresolved: {owner_id}")
                title = str(source["title"])
                source_date = normalized_date(source.get("posted_date"))
                page_url = str(source["source_page_url"])
            elif source_kind == "alio":
                source = alio_by_id.get(owner_id)
                if source is None:
                    raise BackfillContractError(f"ALIO source record unresolved: {owner_id}")
                title = str(source["title"])
                source_date = normalized_date(source.get("final_modified_date"))
                page_url = str(source["detail_url"])
            else:
                raise BackfillContractError(f"unsupported source kind: {source_kind}")

            baseline_sha = str(result["baseline_sha256"])
            if baseline_sha != str(download["sha256"]):
                raise BackfillContractError(f"manifest SHA disagreement: {relative}")
            file_path = downloads / Path(relative)
            if not file_path.is_file():
                raise BackfillContractError(f"preserved binary missing: {relative}")
            items.append(
                CorpusItem(
                    format=format_name,
                    relative_path=relative,
                    source_kind=source_kind,
                    owner_id=owner_id,
                    attachment_key=str(download["key"]),
                    file_name=str(download["filename"]),
                    download_url=str(download["download_url"]),
                    final_url=str(download.get("final_url") or download["download_url"]),
                    content_type=(str(download["content_type"]) if download.get("content_type") else None),
                    size_bytes=int(download["bytes"]),
                    sha256=baseline_sha,
                    collected_at=str(download["collected_at_kst"]),
                    source_title=title,
                    source_date=source_date,
                    source_page_url=page_url,
                    regulation_name=str(result.get("regulation_name") or ""),
                    aliases=tuple(str(value) for value in result.get("aliases", [])),
                )
            )

    if len(items) != EXPECTED_POPULATION:
        raise BackfillContractError(
            f"total population mismatch: {len(items)} != {EXPECTED_POPULATION}"
        )
    for name in (
        "download_manifest.json",
        "current_alio_rules_205.json",
        "current_preannouncements_2089.json",
    ):
        input_hashes[f"preserved-corpus/data/{name}"] = sha256_file(data_dir / name)
    return sorted(items, key=lambda item: item.relative_path), input_hashes


def preflight_binaries(items: Iterable[CorpusItem], downloads: Path) -> None:
    mismatches: list[str] = []
    for item in items:
        path = downloads / Path(item.relative_path)
        actual = sha256_file(path)
        if actual != item.sha256 or path.stat().st_size != item.size_bytes:
            mismatches.append(item.relative_path)
    if mismatches:
        preview = ", ".join(mismatches[:10])
        raise BackfillContractError(
            f"binary integrity mismatch ({len(mismatches)}): {preview}"
        )


def run_parser(item: CorpusItem, downloads: Path, corpus_root: Path) -> tuple[dict[str, Any], dict[str, Any] | None]:
    artifact: dict[str, Any] | None = None

    def capture(value: dict[str, Any]) -> None:
        nonlocal artifact
        if artifact is not None:
            raise BackfillContractError("parser emitted more than one extraction artifact")
        artifact = value

    common = {
        "file_path": downloads / Path(item.relative_path),
        "expected_sha256": item.sha256,
        "file_name": item.file_name,
        "evidence_as_of": item.collected_at,
        "lock_path": LOCK_PATH,
        "redact_roots": (corpus_root, REPO_ROOT),
        "extraction_sink": capture,
    }
    if item.format == "HWP":
        record = hwp_parser_runner.run_file(
            **common, regulation_name=item.regulation_name, aliases=list(item.aliases)
        )
    elif item.format == "HWPX":
        record = hwpx_parser_runner.run_file(
            **common, regulation_name=item.regulation_name, aliases=list(item.aliases)
        )
    elif item.format == "PDF":
        record = pdf_parser_runner.run_file(**common)
    else:
        raise BackfillContractError(f"unsupported parser format: {item.format}")

    successful = record["result"] in ("SUCCESS", "IDENTITY_NOT_FOUND")
    if successful != (artifact is not None):
        raise BackfillContractError(
            f"parser artifact/result contract mismatch: {item.relative_path}"
        )
    return record, artifact


def db_scalar(cursor: psycopg.Cursor[Any], sql: str, params: tuple[Any, ...] = ()) -> Any:
    cursor.execute(sql, params)
    return cursor.fetchone()[0]


def snapshot_protected_state(cursor: psycopg.Cursor[Any]) -> dict[str, Any]:
    current_release_id = db_scalar(
        cursor, "select release_id from publish.current_release where singleton_key"
    )
    state = {
        "current_release_id": str(current_release_id),
        "publish_notices": db_scalar(
            cursor,
            "select count(*) from publish.notices where release_id = %s",
            (current_release_id,),
        ),
        "publish_regulations": db_scalar(
            cursor,
            "select count(*) from publish.regulations where release_id = %s",
            (current_release_id,),
        ),
        "notice_link_occurrences": db_scalar(
            cursor,
            "select coalesce(sum(cardinality(linked_regulation_version_ids)), 0) "
            "from publish.notices where release_id = %s",
            (current_release_id,),
        ),
        "notice_residuals": db_scalar(
            cursor,
            "select count(*) from publish.notice_department_residual_occurrences "
            "where release_id = %s",
            (current_release_id,),
        ),
        "documents_with_legacy_text": db_scalar(
            cursor, "select count(*) from core.documents where extracted_text is not null"
        ),
        "legacy_text_hash": db_scalar(
            cursor,
            "select md5(coalesce(string_agg(sha256 || ':' || "
            "md5(coalesce(extracted_text, '')), ',' order by sha256), '')) "
            "from core.documents where extracted_text is not null",
        ),
    }
    expected = {
        "publish_notices": 2089,
        "publish_regulations": 1041,
        "notice_link_occurrences": 3775,
        "notice_residuals": 1272,
    }
    for key, value in expected.items():
        if state[key] != value:
            raise BackfillContractError(
                f"protected baseline mismatch: {key}={state[key]} expected {value}"
            )
    return state


def snapshot_existing_documents(
    cursor: psycopg.Cursor[Any], expected_sha256: set[str]
) -> dict[str, tuple[Any, ...]]:
    cursor.execute(
        "select sha256, file_name, file_size_bytes, mime_type, detected_format, "
        "magic_verified, extracted_text, extraction_result, storage_path "
        "from core.documents where sha256 = any(%s::char(64)[]) order by sha256",
        (list(expected_sha256),),
    )
    return {
        str(row[0]).strip(): tuple(row[1:])
        for row in cursor.fetchall()
    }


def ensure_database_contract(cursor: psycopg.Cursor[Any]) -> None:
    cursor.execute(
        "select current_database(), "
        "to_regclass('core.source_attachments'), "
        "to_regclass('core.source_attachment_observations'), "
        "to_regclass('core.document_extractions'), "
        "to_regclass('core.parser_runs')"
    )
    database_name, *relations = cursor.fetchone()
    if database_name != "postgres" or any(value is None for value in relations):
        raise BackfillContractError("wrong database or T02-B schema mismatch")
    version = db_scalar(
        cursor,
        "select count(*) from supabase_migrations.schema_migrations "
        "where version = '20260917000200'",
    )
    if version != 1:
        raise BackfillContractError("T02-B migration version is not installed exactly once")


def ensure_source(cursor: psycopg.Cursor[Any], kind: str) -> Any:
    source = SOURCE_CODES[kind]
    cursor.execute(
        "select source_id from core.sources where source_code = %s",
        (source["source_code"],),
    )
    found = cursor.fetchone()
    if found:
        return found[0]
    cursor.execute(
        "insert into core.sources "
        "(source_code, name, source_type, base_url, is_official, active) "
        "values (%s, %s, %s, %s, true, true) returning source_id",
        (
            source["source_code"],
            source["name"],
            source["source_type"],
            source["base_url"],
        ),
    )
    return cursor.fetchone()[0]


def ensure_source_record(cursor: psycopg.Cursor[Any], source_id: Any, item: CorpusItem) -> tuple[Any, bool]:
    cursor.execute(
        "select source_record_id from core.source_records "
        "where source_id = %s and external_key = %s",
        (source_id, item.owner_id),
    )
    found = cursor.fetchone()
    if found:
        return found[0], False
    metadata = {
        "backfill_contract_version": BACKFILL_CONTRACT_VERSION,
        "source_kind": item.source_kind,
        "owner_id": item.owner_id,
    }
    cursor.execute(
        "insert into core.source_records "
        "(source_id, external_key, title, published_at, page_url, raw_metadata, first_seen_at, last_seen_at) "
        "values (%s, %s, %s, %s, %s, %s::jsonb, %s, %s) returning source_record_id",
        (
            source_id,
            item.owner_id,
            item.source_title,
            item.source_date,
            item.source_page_url,
            json.dumps(metadata),
            item.collected_at,
            item.collected_at,
        ),
    )
    return cursor.fetchone()[0], True


def ensure_document(cursor: psycopg.Cursor[Any], item: CorpusItem) -> bool:
    detected_format = {"HWP": "hwp5", "HWPX": "hwpx", "PDF": "pdf"}[item.format]
    cursor.execute(
        "select file_size_bytes, detected_format from core.documents where sha256 = %s",
        (item.sha256,),
    )
    found = cursor.fetchone()
    if found:
        if found[0] not in (None, item.size_bytes) or found[1] not in ("unknown", detected_format):
            raise BackfillContractError(f"existing document contract mismatch: {item.sha256}")
        return False
    cursor.execute(
        "insert into core.documents "
        "(sha256, file_name, file_size_bytes, mime_type, detected_format, magic_verified, "
        "extracted_text, extraction_result) values (%s, %s, %s, %s, %s, true, null, 'pending')",
        (item.sha256, item.file_name, item.size_bytes, item.content_type, detected_format),
    )
    return True


def observation_key(item: CorpusItem) -> str:
    return sha256_bytes(
        canonical_json(
            {
                "contract": BACKFILL_CONTRACT_VERSION,
                "url": item.download_url,
                "sha256": item.sha256,
                "observed_at": item.collected_at,
            }
        )
    )


def ensure_attachment_chain(cursor: psycopg.Cursor[Any], source_record_id: Any, item: CorpusItem) -> tuple[Any, dict[str, int]]:
    created = Counter()
    cursor.execute(
        "select document_url_id from core.document_urls "
        "where source_record_id = %s and normalized_url = %s order by first_seen_at limit 1",
        (source_record_id, item.download_url),
    )
    row = cursor.fetchone()
    if row:
        document_url_id = row[0]
    else:
        cursor.execute(
            "insert into core.document_urls "
            "(source_record_id, discovered_url, normalized_url, final_url, discovery_method, first_seen_at, last_seen_at) "
            "values (%s, %s, %s, %s, %s, %s, %s) returning document_url_id",
            (
                source_record_id,
                item.download_url,
                item.download_url,
                item.final_url,
                "preserved_corpus_backfill_v1",
                item.collected_at,
                item.collected_at,
            ),
        )
        document_url_id = cursor.fetchone()[0]
        created["document_urls"] += 1

    key = observation_key(item)
    cursor.execute(
        "select document_url_observation_id, document_sha256 "
        "from core.document_url_observations where observation_key = %s",
        (key,),
    )
    row = cursor.fetchone()
    if row:
        document_url_observation_id = row[0]
        if str(row[1]).strip() != item.sha256:
            raise BackfillContractError(f"observation key collision: {item.relative_path}")
    else:
        cursor.execute(
            "insert into core.document_url_observations "
            "(document_url_id, document_sha256, observed_at, http_status, content_length, observation_key) "
            "values (%s, %s, %s, 200, %s, %s) returning document_url_observation_id",
            (document_url_id, item.sha256, item.collected_at, item.size_bytes, key),
        )
        document_url_observation_id = cursor.fetchone()[0]
        created["document_url_observations"] += 1

    cursor.execute(
        "select attachment_id from core.source_attachments "
        "where source_record_id = %s and external_attachment_key = %s",
        (source_record_id, item.attachment_key),
    )
    row = cursor.fetchone()
    if row:
        attachment_id = row[0]
    else:
        cursor.execute(
            "insert into core.source_attachments "
            "(source_record_id, external_attachment_key, original_file_name) "
            "values (%s, %s, %s) returning attachment_id",
            (source_record_id, item.attachment_key, item.file_name),
        )
        attachment_id = cursor.fetchone()[0]
        created["source_attachments"] += 1

    cursor.execute(
        "select attachment_observation_id, document_sha256 "
        "from core.source_attachment_observations "
        "where attachment_id = %s and document_url_observation_id = %s",
        (attachment_id, document_url_observation_id),
    )
    row = cursor.fetchone()
    if row:
        attachment_observation_id = row[0]
        if str(row[1]).strip() != item.sha256:
            raise BackfillContractError(f"attachment observation SHA mismatch: {item.relative_path}")
    else:
        cursor.execute(
            "insert into core.source_attachment_observations "
            "(attachment_id, document_url_observation_id, document_sha256) "
            "values (%s, %s, %s) returning attachment_observation_id",
            (attachment_id, document_url_observation_id, item.sha256),
        )
        attachment_observation_id = cursor.fetchone()[0]
        created["attachment_observations"] += 1
    return attachment_observation_id, dict(created)


def run_is_already_persisted(
    cursor: psycopg.Cursor[Any],
    attachment_observation_id: Any,
    record: Mapping[str, Any],
    artifact: Mapping[str, Any] | None,
) -> bool:
    params: list[Any] = [
        attachment_observation_id,
        record["input_sha256"],
        record["parser_name"],
        record["parser_version"],
        record["parser_source_sha256"],
        record["environment_fingerprint"],
    ]
    if artifact is not None:
        cursor.execute(
            "select exists (select 1 from core.parser_runs r "
            "join core.document_extractions e on e.extraction_id = r.extraction_id "
            "where r.attachment_observation_id = %s and r.document_sha256 = %s "
            "and r.parser_name = %s and r.parser_version = %s "
            "and r.parser_source_sha256 = %s and r.environment_fingerprint = %s "
            "and r.parser_result = 'SUCCESS' and e.extract_hash = %s "
            "and e.extraction_contract_version = %s)",
            tuple(params + [artifact["extract_hash"], artifact["extraction_contract_version"]]),
        )
    else:
        cursor.execute(
            "select exists (select 1 from core.parser_runs r "
            "where r.attachment_observation_id = %s and r.document_sha256 = %s "
            "and r.parser_name = %s and r.parser_version = %s "
            "and r.parser_source_sha256 = %s and r.environment_fingerprint = %s "
            "and r.parser_result = %s and coalesce(r.failure_domain, '') = %s "
            "and coalesce(r.failure_code, '') = %s)",
            tuple(
                params
                + [
                    record["result"],
                    record.get("failure_domain", ""),
                    record.get("failure_code", ""),
                ]
            ),
        )
    return bool(cursor.fetchone()[0])


def persist_item(
    cursor: psycopg.Cursor[Any],
    source_ids: Mapping[str, Any],
    item: CorpusItem,
    record: dict[str, Any],
    artifact: dict[str, Any] | None,
    *,
    dry_run: bool,
) -> Counter[str]:
    counters: Counter[str] = Counter()
    source_record_id, source_created = ensure_source_record(
        cursor, source_ids[item.source_kind], item
    )
    counters["source_records"] += int(source_created)
    counters["documents"] += int(ensure_document(cursor, item))
    attachment_observation_id, created = ensure_attachment_chain(
        cursor, source_record_id, item
    )
    counters.update(created)

    already = run_is_already_persisted(cursor, attachment_observation_id, record, artifact)
    if already:
        counters["deduped_parser_runs"] += 1
        if artifact is not None:
            counters["deduped_extractions"] += 1
        return counters

    if dry_run:
        counters["planned_parser_runs"] += 1
        if artifact is not None:
            cursor.execute(
                "select extract_hash from core.document_extractions "
                "where document_sha256 = %s and extraction_contract_version = %s",
                (item.sha256, artifact["extraction_contract_version"]),
            )
            hashes = {str(row[0]).strip() for row in cursor.fetchall()}
            if artifact["extract_hash"] in hashes:
                counters["deduped_extractions"] += 1
            elif hashes:
                counters["changed_text"] += 1
            else:
                counters["planned_extractions"] += 1
        return counters

    extraction_existed = False
    if artifact is not None:
        cursor.execute(
            "select exists (select 1 from core.document_extractions "
            "where document_sha256 = %s and extract_hash = %s "
            "and extraction_contract_version = %s)",
            (
                item.sha256,
                artifact["extract_hash"],
                artifact["extraction_contract_version"],
            ),
        )
        extraction_existed = bool(cursor.fetchone()[0])
    cursor.execute(
        "select core.record_parser_execution(%s, %s::jsonb, %s::jsonb)",
        (
            attachment_observation_id,
            json.dumps(record, ensure_ascii=False),
            json.dumps(artifact, ensure_ascii=False) if artifact is not None else None,
        ),
    )
    cursor.fetchone()
    counters["parser_runs"] += 1
    if artifact is not None:
        counters["successful_text_runs"] += 1
        counters["deduped_extractions" if extraction_existed else "new_extractions"] += 1
    return counters


def validate_ledger(cursor: psycopg.Cursor[Any], expected_sha256: set[str]) -> dict[str, int]:
    cursor.execute(
        "select "
        "(select count(*) from core.documents where sha256 = any(%s::char(64)[])), "
        "(select count(*) from core.document_extractions where document_sha256 = any(%s::char(64)[])), "
        "(select count(*) from core.parser_runs where document_sha256 = any(%s::char(64)[])), "
        "(select coalesce(sum(extracted_char_count), 0) from core.document_extractions "
        " where document_sha256 = any(%s::char(64)[])), "
        "(select count(distinct o.attachment_observation_id) "
        " from core.source_attachment_observations o where o.document_sha256 = any(%s::char(64)[])), "
        "(select count(distinct o.attachment_id) "
        " from core.source_attachment_observations o where o.document_sha256 = any(%s::char(64)[]))",
        tuple([list(expected_sha256)] * 6),
    )
    documents, extractions, parser_runs, characters, observations, attachments = cursor.fetchone()
    invalid_hashes = db_scalar(
        cursor,
        "select count(*) from core.document_extractions e "
        "where e.document_sha256 = any(%s::char(64)[]) and "
        "e.extract_hash <> encode(extensions.digest(convert_to(e.extracted_text, 'UTF8'), 'sha256'), 'hex')",
        (list(expected_sha256),),
    )
    invalid_lengths = db_scalar(
        cursor,
        "select count(*) from core.document_extractions e "
        "where e.document_sha256 = any(%s::char(64)[]) and e.extracted_char_count <> char_length(e.extracted_text)",
        (list(expected_sha256),),
    )
    broken_fk = db_scalar(
        cursor,
        "select count(*) from core.parser_runs r "
        "left join core.source_attachment_observations o "
        "on o.attachment_observation_id = r.attachment_observation_id "
        "left join core.source_attachments a on a.attachment_id = o.attachment_id "
        "left join core.source_records sr on sr.source_record_id = a.source_record_id "
        "left join core.documents d on d.sha256 = r.document_sha256 "
        "where r.document_sha256 = any(%s::char(64)[]) "
        "and (o.attachment_observation_id is null or a.attachment_id is null "
        "or sr.source_record_id is null or d.sha256 is null)",
        (list(expected_sha256),),
    )
    duplicate_extractions = db_scalar(
        cursor,
        "select count(*) from (select document_sha256, extract_hash, extraction_contract_version "
        "from core.document_extractions where document_sha256 = any(%s::char(64)[]) "
        "group by 1,2,3 having count(*) > 1) q",
        (list(expected_sha256),),
    )
    if invalid_hashes or invalid_lengths or broken_fk or duplicate_extractions:
        raise BackfillContractError("ledger integrity validation failed")
    return {
        "unique_binaries": int(documents),
        "unique_extractions": int(extractions),
        "parser_runs": int(parser_runs),
        "extracted_characters": int(characters),
        "attachment_observations": int(observations),
        "source_attachments": int(attachments),
        "invalid_extract_hashes": int(invalid_hashes),
        "invalid_char_counts": int(invalid_lengths),
        "broken_fk_chains": int(broken_fk),
        "duplicate_extraction_keys": int(duplicate_extractions),
    }


def write_summary(path: Path, summary: Mapping[str, Any]) -> None:
    payload = json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload, encoding="utf-8")


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
            raise BackfillContractError(
                f"Supabase CLI writer failed with exit code {completed.returncode}: {detail}"
            )
        try:
            response = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise BackfillContractError("Supabase CLI returned non-JSON output") from exc
        rows = response.get("rows")
        if not isinstance(rows, list):
            raise BackfillContractError("Supabase CLI query response has no rows array")
        return rows
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def cli_read_object(sql: str, column: str) -> dict[str, Any]:
    rows = run_supabase_query(sql)
    if len(rows) != 1 or column not in rows[0]:
        raise BackfillContractError(f"unexpected Management API result for {column}")
    value = rows[0][column]
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict):
        raise BackfillContractError(f"Management API {column} is not an object")
    return value


def cli_contract_state() -> dict[str, Any]:
    sql = """
select json_build_object(
  'database_name', current_database(),
  'ledger_ready',
    to_regclass('core.source_attachments') is not null
    and to_regclass('core.source_attachment_observations') is not null
    and to_regclass('core.document_extractions') is not null
    and to_regclass('core.parser_runs') is not null,
  'migration_count', (
    select count(*) from supabase_migrations.schema_migrations
    where version = '20260917000200'
  ),
  'current_release_id', (
    select release_id from publish.current_release where singleton_key
  ),
  'publish_notices', (
    select count(*) from publish.notices n join publish.current_release c
      on c.release_id = n.release_id where c.singleton_key
  ),
  'publish_regulations', (
    select count(*) from publish.regulations r join publish.current_release c
      on c.release_id = r.release_id where c.singleton_key
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
  'documents_with_legacy_text', (
    select count(*) from core.documents where extracted_text is not null
  ),
  'legacy_text_hash', (
    select md5(coalesce(string_agg(sha256 || ':' || md5(coalesce(extracted_text, '')),
      ',' order by sha256), '')) from core.documents where extracted_text is not null
  )
) as contract_state;
"""
    state = cli_read_object(sql, "contract_state")
    expected = {
        "database_name": "postgres",
        "ledger_ready": True,
        "migration_count": 1,
        "publish_notices": 2089,
        "publish_regulations": 1041,
        "notice_link_occurrences": 3775,
        "notice_residuals": 1272,
    }
    for key, value in expected.items():
        if state.get(key) != value:
            raise BackfillContractError(
                f"remote contract mismatch: {key}={state.get(key)} expected {value}"
            )
    return state


def cli_batch_payload(
    parsed: Iterable[tuple[CorpusItem, dict[str, Any], dict[str, Any] | None]]
) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for item, record, artifact in parsed:
        source = SOURCE_CODES[item.source_kind]
        payload.append(
            {
                "source_kind": item.source_kind,
                "source_code": source["source_code"],
                "source_name": source["name"],
                "source_type": source["source_type"],
                "base_url": source["base_url"],
                "owner_id": item.owner_id,
                "source_title": item.source_title,
                "source_date": item.source_date,
                "source_page_url": item.source_page_url,
                "attachment_key": item.attachment_key,
                "file_name": item.file_name,
                "download_url": item.download_url,
                "final_url": item.final_url,
                "content_type": item.content_type,
                "size_bytes": item.size_bytes,
                "document_sha256": item.sha256,
                "detected_format": {"HWP": "hwp5", "HWPX": "hwpx", "PDF": "pdf"}[
                    item.format
                ],
                "collected_at": item.collected_at,
                "observation_key": observation_key(item),
                "run": record,
                "artifact": artifact,
            }
        )
    return payload


def iter_cli_batches(
    parsed: list[tuple[CorpusItem, dict[str, Any], dict[str, Any] | None]]
) -> Iterable[list[dict[str, Any]]]:
    batch: list[dict[str, Any]] = []
    batch_size = 2
    for entry in parsed:
        payload = cli_batch_payload([entry])[0]
        item_size = len(canonical_json(payload)) + 1
        if item_size > CLI_BATCH_PAYLOAD_BYTES:
            raise BackfillContractError(
                f"single extraction payload exceeds Management API safety limit: "
                f"{entry[0].relative_path}"
            )
        if batch and (
            len(batch) >= CLI_BATCH_SIZE
            or batch_size + item_size > CLI_BATCH_PAYLOAD_BYTES
        ):
            yield batch
            batch = []
            batch_size = 2
        batch.append(payload)
        batch_size += item_size
    if batch:
        yield batch


def cli_apply_batch(payload: list[dict[str, Any]]) -> None:
    encoded = encode_json_sql(payload)
    sql = f"""
begin;
set local role service_role;
do $t02c$
declare
  p jsonb;
  v_source_id uuid;
  v_source_record_id uuid;
  v_document_url_id uuid;
  v_url_observation_id uuid;
  v_attachment_id uuid;
  v_attachment_observation_id uuid;
  v_already boolean;
begin
  for p in select value from jsonb_array_elements({encoded}) loop
    insert into core.sources
      (source_code, name, source_type, base_url, is_official, active)
    values
      (p->>'source_code', p->>'source_name', p->>'source_type', p->>'base_url', true, true)
    on conflict (source_code) do nothing;

    select source_id into strict v_source_id
    from core.sources where source_code = p->>'source_code';

    insert into core.source_records
      (source_id, external_key, title, published_at, page_url, raw_metadata,
       first_seen_at, last_seen_at)
    values
      (v_source_id, p->>'owner_id', p->>'source_title',
       nullif(p->>'source_date', '')::date, p->>'source_page_url',
       jsonb_build_object('backfill_contract_version', '{BACKFILL_CONTRACT_VERSION}',
         'source_kind', p->>'source_kind', 'owner_id', p->>'owner_id'),
       (p->>'collected_at')::timestamptz, (p->>'collected_at')::timestamptz)
    on conflict (source_id, external_key) do nothing;

    select source_record_id into strict v_source_record_id
    from core.source_records
    where source_id = v_source_id and external_key = p->>'owner_id';

    insert into core.documents
      (sha256, file_name, file_size_bytes, mime_type, detected_format,
       magic_verified, extracted_text, extraction_result)
    values
      (p->>'document_sha256', p->>'file_name', (p->>'size_bytes')::bigint,
       nullif(p->>'content_type', ''), p->>'detected_format', true, null, 'pending')
    on conflict (sha256) do nothing;

    select document_url_id into v_document_url_id
    from core.document_urls
    where source_record_id = v_source_record_id
      and normalized_url = p->>'download_url'
    order by first_seen_at limit 1;
    if v_document_url_id is null then
      insert into core.document_urls
        (source_record_id, discovered_url, normalized_url, final_url,
         discovery_method, first_seen_at, last_seen_at)
      values
        (v_source_record_id, p->>'download_url', p->>'download_url',
         p->>'final_url', 'preserved_corpus_backfill_v1',
         (p->>'collected_at')::timestamptz, (p->>'collected_at')::timestamptz)
      returning document_url_id into v_document_url_id;
    end if;

    insert into core.document_url_observations
      (document_url_id, document_sha256, observed_at, http_status,
       content_length, observation_key)
    values
      (v_document_url_id, p->>'document_sha256',
       (p->>'collected_at')::timestamptz, 200,
       (p->>'size_bytes')::bigint, p->>'observation_key')
    on conflict (observation_key) do nothing;

    select document_url_observation_id into strict v_url_observation_id
    from core.document_url_observations
    where observation_key = p->>'observation_key';

    insert into core.source_attachments
      (source_record_id, external_attachment_key, original_file_name)
    values
      (v_source_record_id, p->>'attachment_key', p->>'file_name')
    on conflict (source_record_id, external_attachment_key) do nothing;

    select attachment_id into strict v_attachment_id
    from core.source_attachments
    where source_record_id = v_source_record_id
      and external_attachment_key = p->>'attachment_key';

    insert into core.source_attachment_observations
      (attachment_id, document_url_observation_id, document_sha256)
    values
      (v_attachment_id, v_url_observation_id, p->>'document_sha256')
    on conflict (attachment_id, document_url_observation_id) do nothing;

    select attachment_observation_id into strict v_attachment_observation_id
    from core.source_attachment_observations
    where attachment_id = v_attachment_id
      and document_url_observation_id = v_url_observation_id;

    if p->'artifact' is not null and p->'artifact' <> 'null'::jsonb then
      select exists (
        select 1 from core.parser_runs r
        join core.document_extractions e on e.extraction_id = r.extraction_id
        where r.attachment_observation_id = v_attachment_observation_id
          and r.document_sha256 = p->>'document_sha256'
          and r.parser_name = p->'run'->>'parser_name'
          and r.parser_version = p->'run'->>'parser_version'
          and r.parser_source_sha256 = p->'run'->>'parser_source_sha256'
          and r.environment_fingerprint = p->'run'->>'environment_fingerprint'
          and r.parser_result = 'SUCCESS'
          and e.extract_hash = p->'artifact'->>'extract_hash'
          and e.extraction_contract_version =
            p->'artifact'->>'extraction_contract_version'
      ) into v_already;
    else
      select exists (
        select 1 from core.parser_runs r
        where r.attachment_observation_id = v_attachment_observation_id
          and r.document_sha256 = p->>'document_sha256'
          and r.parser_name = p->'run'->>'parser_name'
          and r.parser_version = p->'run'->>'parser_version'
          and r.parser_source_sha256 = p->'run'->>'parser_source_sha256'
          and r.environment_fingerprint = p->'run'->>'environment_fingerprint'
          and r.parser_result = p->'run'->>'result'
          and coalesce(r.failure_domain, '') =
            coalesce(p->'run'->>'failure_domain', '')
          and coalesce(r.failure_code, '') =
            coalesce(p->'run'->>'failure_code', '')
      ) into v_already;
    end if;

    if not v_already then
      perform core.record_parser_execution(
        v_attachment_observation_id,
        p->'run',
        case when p->'artifact' = 'null'::jsonb then null else p->'artifact' end
      );
    end if;
  end loop;
end
$t02c$;
commit;
select json_build_object('processed', {len(payload)}) as batch_result;
"""
    result = cli_read_object(sql, "batch_result")
    if result.get("processed") != len(payload):
        raise BackfillContractError("Management API batch acknowledgement mismatch")


def cli_verify(expected_sha256: set[str]) -> dict[str, Any]:
    hashes = encode_json_sql(sorted(expected_sha256))
    sql = f"""
with target as (
  select jsonb_array_elements_text({hashes})::char(64) as sha256
)
select json_build_object(
  'unique_binaries', (
    select count(*) from core.documents d join target t using (sha256)
  ),
  'unique_extractions', (
    select count(*) from core.document_extractions e join target t
      on t.sha256 = e.document_sha256
  ),
  'parser_runs', (
    select count(*) from core.parser_runs r join target t
      on t.sha256 = r.document_sha256
  ),
  'extracted_characters', (
    select coalesce(sum(e.extracted_char_count), 0)
    from core.document_extractions e join target t on t.sha256 = e.document_sha256
  ),
  'attachment_observations', (
    select count(distinct o.attachment_observation_id)
    from core.source_attachment_observations o join target t
      on t.sha256 = o.document_sha256
  ),
  'source_attachments', (
    select count(distinct o.attachment_id)
    from core.source_attachment_observations o join target t
      on t.sha256 = o.document_sha256
  ),
  'invalid_extract_hashes', (
    select count(*) from core.document_extractions e join target t
      on t.sha256 = e.document_sha256
    where e.extract_hash <> encode(
      extensions.digest(convert_to(e.extracted_text, 'UTF8'), 'sha256'), 'hex')
  ),
  'invalid_char_counts', (
    select count(*) from core.document_extractions e join target t
      on t.sha256 = e.document_sha256
    where e.extracted_char_count <> char_length(e.extracted_text)
  ),
  'broken_fk_chains', (
    select count(*) from core.parser_runs r join target t
      on t.sha256 = r.document_sha256
    left join core.source_attachment_observations o
      on o.attachment_observation_id = r.attachment_observation_id
    left join core.source_attachments a on a.attachment_id = o.attachment_id
    left join core.source_records sr on sr.source_record_id = a.source_record_id
    left join core.documents d on d.sha256 = r.document_sha256
    where o.attachment_observation_id is null or a.attachment_id is null
      or sr.source_record_id is null or d.sha256 is null
  ),
  'duplicate_extraction_keys', (
    select count(*) from (
      select e.document_sha256, e.extract_hash, e.extraction_contract_version
      from core.document_extractions e join target t on t.sha256 = e.document_sha256
      group by 1,2,3 having count(*) > 1
    ) q
  )
) as ledger_state;
"""
    result = cli_read_object(sql, "ledger_state")
    for key in (
        "invalid_extract_hashes",
        "invalid_char_counts",
        "broken_fk_chains",
        "duplicate_extraction_keys",
    ):
        if result.get(key) != 0:
            raise BackfillContractError(f"ledger integrity failed: {key}")
    return result


def cli_idempotency_check(
    parsed: list[tuple[CorpusItem, dict[str, Any], dict[str, Any] | None]]
) -> dict[str, Any]:
    checks: Counter[str] = Counter()
    for payload in iter_cli_batches(parsed):
        encoded = encode_json_sql(payload)
        sql = f"""
with payload as (
  select value as p from jsonb_array_elements({encoded})
), resolved as (
  select p.p, sr.source_record_id, sa.attachment_id,
    duo.document_url_observation_id, sao.attachment_observation_id
  from payload p
  left join core.sources s on s.source_code = p.p->>'source_code'
  left join core.source_records sr on sr.source_id = s.source_id
    and sr.external_key = p.p->>'owner_id'
  left join core.source_attachments sa on sa.source_record_id = sr.source_record_id
    and sa.external_attachment_key = p.p->>'attachment_key'
  left join core.document_url_observations duo
    on duo.observation_key = p.p->>'observation_key'
  left join core.source_attachment_observations sao
    on sao.attachment_id = sa.attachment_id
    and sao.document_url_observation_id = duo.document_url_observation_id
)
select json_build_object(
  'missing_attachment_identities', count(*) filter (where attachment_id is null),
  'missing_attachment_observations', count(*) filter (where attachment_observation_id is null),
  'missing_documents', count(*) filter (where not exists (
    select 1 from core.documents d where d.sha256 = p->>'document_sha256'
  )),
  'new_extractions', count(*) filter (
    where p->'artifact' <> 'null'::jsonb and not exists (
      select 1 from core.document_extractions e
      where e.document_sha256 = p->>'document_sha256'
        and e.extract_hash = p->'artifact'->>'extract_hash'
        and e.extraction_contract_version = p->'artifact'->>'extraction_contract_version'
    )
  ),
  'changed_text', count(*) filter (
    where p->'artifact' <> 'null'::jsonb and exists (
      select 1 from core.document_extractions e
      where e.document_sha256 = p->>'document_sha256'
        and e.extraction_contract_version = p->'artifact'->>'extraction_contract_version'
      and e.extract_hash <> p->'artifact'->>'extract_hash'
    )
  ),
  'missing_exact_runs', count(*) filter (
    where attachment_observation_id is null or not (
      (
        p->'artifact' <> 'null'::jsonb and exists (
          select 1 from core.parser_runs r
          join core.document_extractions e on e.extraction_id = r.extraction_id
          where r.attachment_observation_id = resolved.attachment_observation_id
            and r.document_sha256 = p->>'document_sha256'
            and r.parser_name = p->'run'->>'parser_name'
            and r.parser_version = p->'run'->>'parser_version'
            and r.parser_source_sha256 = p->'run'->>'parser_source_sha256'
            and r.environment_fingerprint = p->'run'->>'environment_fingerprint'
            and r.parser_result = 'SUCCESS'
            and e.extract_hash = p->'artifact'->>'extract_hash'
            and e.extraction_contract_version =
              p->'artifact'->>'extraction_contract_version'
        )
      ) or (
        p->'artifact' = 'null'::jsonb and exists (
          select 1 from core.parser_runs r
          where r.attachment_observation_id = resolved.attachment_observation_id
            and r.document_sha256 = p->>'document_sha256'
            and r.parser_name = p->'run'->>'parser_name'
            and r.parser_version = p->'run'->>'parser_version'
            and r.parser_source_sha256 = p->'run'->>'parser_source_sha256'
            and r.environment_fingerprint = p->'run'->>'environment_fingerprint'
            and r.parser_result = p->'run'->>'result'
            and coalesce(r.failure_domain, '') =
              coalesce(p->'run'->>'failure_domain', '')
            and coalesce(r.failure_code, '') =
              coalesce(p->'run'->>'failure_code', '')
        )
      )
    )
  )
) as idempotency_state
from resolved;
"""
        result = cli_read_object(sql, "idempotency_state")
        checks.update({key: int(value) for key, value in result.items()})
    return dict(checks)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus-root", type=Path, default=os.environ.get(CORPUS_ROOT_ENV))
    parser.add_argument("--database-url", default=os.environ.get(DATABASE_URL_ENV))
    parser.add_argument(
        "--writer", choices=("auto", "supabase-cli", "direct"), default="auto"
    )
    parser.add_argument("--mode", choices=("preflight", "apply", "dry-run"), required=True)
    parser.add_argument("--summary", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.corpus_root is None:
        raise BackfillContractError(
            f"--corpus-root or {CORPUS_ROOT_ENV} is required"
        )
    corpus_root = args.corpus_root.resolve()
    items, input_hashes = load_population(corpus_root)
    preflight_binaries(items, corpus_root / "downloads")
    if args.mode == "preflight":
        print(json.dumps({"population": len(items), "by_format": EXPECTED_COUNTS}))
        return 0
    started = datetime.now(timezone.utc)
    parsed: list[tuple[CorpusItem, dict[str, Any], dict[str, Any] | None]] = []
    outcomes: Counter[str] = Counter()
    failures: Counter[str] = Counter()
    format_outcomes: dict[str, Counter[str]] = {
        format_name: Counter() for format_name in EXPECTED_COUNTS
    }
    unresolved_items: list[dict[str, str]] = []
    total_chars = 0
    for index, item in enumerate(items, start=1):
        record, artifact = run_parser(item, corpus_root / "downloads", corpus_root)
        parsed.append((item, record, artifact))
        outcomes[str(record["result"])] += 1
        format_outcomes[item.format][str(record["result"])] += 1
        if record.get("failure_domain"):
            failures[f"{record['failure_domain']}/{record['failure_code']}"] += 1
        if artifact is None:
            unresolved_items.append(
                {
                    "relative_path": item.relative_path,
                    "format": item.format,
                    "sha256": item.sha256,
                    "result": str(record["result"]),
                    "failure_domain": str(record.get("failure_domain") or ""),
                    "failure_code": str(record.get("failure_code") or ""),
                    "error_class": str(record.get("error_class") or ""),
                    "error_message": str(record.get("error_message") or ""),
                }
            )
        if artifact is not None:
            total_chars += int(artifact["extracted_char_count"])
        if index % 100 == 0:
            print(f"parsed {index}/{len(items)}", flush=True)

    dry_run = args.mode == "dry-run"
    expected_sha256 = {item.sha256 for item in items}
    selected_writer = args.writer
    if selected_writer == "auto":
        selected_writer = "direct" if args.database_url else "supabase-cli"
    counters: Counter[str] = Counter()
    idempotency: dict[str, Any] | None = None

    if selected_writer == "supabase-cli":
        protected_before = cli_contract_state()
        ledger_before = cli_verify(expected_sha256)
        if not dry_run:
            persisted_count = 0
            for batch in iter_cli_batches(parsed):
                cli_apply_batch(batch)
                persisted_count += len(batch)
                print(
                    f"persisted {persisted_count}/{len(parsed)}",
                    flush=True,
                )
        ledger = cli_verify(expected_sha256)
        protected_after = cli_contract_state()
        if protected_before != protected_after:
            raise BackfillContractError("protected data changed during T02-C")
        idempotency = cli_idempotency_check(parsed)
        if any(int(value) != 0 for value in idempotency.values()):
            raise BackfillContractError(
                "idempotency check found missing or changed persisted values"
            )
        for key in (
            "unique_binaries",
            "unique_extractions",
            "parser_runs",
            "attachment_observations",
            "source_attachments",
        ):
            counters[f"new_{key}"] = int(ledger[key]) - int(ledger_before[key])
        artifact_input_count = sum(1 for _, _, artifact in parsed if artifact is not None)
        counters["deduped_extractions"] = (
            artifact_input_count - counters["new_unique_extractions"]
        )
    else:
        if not args.database_url:
            raise BackfillContractError(
                f"direct writer requires --database-url or {DATABASE_URL_ENV}"
            )
        with psycopg.connect(args.database_url, autocommit=False) as connection:
            try:
                with connection.cursor() as cursor:
                    cursor.execute("set role service_role")
                    ensure_database_contract(cursor)
                    protected_before = snapshot_protected_state(cursor)
                    existing_documents_before = snapshot_existing_documents(
                        cursor, expected_sha256
                    )
                    source_ids = {
                        kind: ensure_source(cursor, kind) for kind in sorted(SOURCE_CODES)
                    }
                    for index, (item, record, artifact) in enumerate(parsed, start=1):
                        counters.update(
                            persist_item(
                                cursor,
                                source_ids,
                                item,
                                record,
                                artifact,
                                dry_run=dry_run,
                            )
                        )
                        if index % 100 == 0:
                            print(f"persisted {index}/{len(parsed)}", flush=True)
                    ledger = validate_ledger(cursor, expected_sha256)
                    protected_after = snapshot_protected_state(cursor)
                    if protected_before != protected_after:
                        raise BackfillContractError("protected data changed during T02-C")
                    existing_documents_after = snapshot_existing_documents(
                        cursor, set(existing_documents_before)
                    )
                    if existing_documents_before != existing_documents_after:
                        raise BackfillContractError(
                            "pre-existing core.documents rows changed during T02-C"
                        )
                    if dry_run:
                        connection.rollback()
                    else:
                        connection.commit()
            except Exception:
                connection.rollback()
                raise

    summary = {
        "contract_version": BACKFILL_CONTRACT_VERSION,
        "mode": args.mode,
        "writer": selected_writer,
        "started_at": started.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "population": len(items),
        "by_format": dict(EXPECTED_COUNTS),
        "outcomes": dict(sorted(outcomes.items())),
        "outcomes_by_format": {
            key: dict(sorted(value.items())) for key, value in format_outcomes.items()
        },
        "failure_domain_code": dict(sorted(failures.items())),
        "unresolved_items": unresolved_items,
        "source_resolution_failures": 0,
        "binary_missing": 0,
        "persistence_failures": 0,
        "parser_output_characters": total_chars,
        "persistence": dict(sorted(counters.items())),
        "ledger": ledger,
        "idempotency": idempotency,
        "input_artifact_sha256": dict(sorted(input_hashes.items())),
        "protected_state_unchanged": True,
        "core_documents_extracted_text_used_as_canonical": False,
        "mentions_created": False,
    }
    if args.summary:
        write_summary(args.summary, summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BackfillContractError as exc:
        print(f"T02-C STOP: {exc}", file=sys.stderr)
        raise SystemExit(2)
