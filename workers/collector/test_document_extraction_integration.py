"""T02-B integration contract against a remote PostgreSQL test transaction.

The PowerShell launcher supplies the pinned parser runtime and sample paths. All
database writes run as ``service_role`` inside one transaction that is always
rolled back. No service-role key is accepted or printed by this test.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any, Callable

import psycopg
import pytest
from pypdf import PdfWriter


COLLECTOR_DIR = Path(__file__).resolve().parent
if str(COLLECTOR_DIR) not in sys.path:
    sys.path.insert(0, str(COLLECTOR_DIR))

import hwp_parser_runner  # noqa: E402
import hwpx_parser_runner  # noqa: E402
import pdf_parser_runner  # noqa: E402


LOCK_PATH = COLLECTOR_DIR / "requirements.txt"
EVIDENCE_AS_OF = "2026-09-17T00:00:00+00:00"
DATABASE_URL_ENV = "KODIT_TEST_DATABASE_URL"
SAMPLE_ENV = {
    "hwp": "KODIT_TEST_HWP_PATH",
    "hwpx": "KODIT_TEST_HWPX_PATH",
    "pdf": "KODIT_TEST_PDF_PATH",
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def required_path(variable: str) -> Path:
    value = os.environ.get(variable)
    if not value:
        pytest.skip(f"{variable} is required for the remote integration target")
    path = Path(value).resolve()
    if not path.is_file():
        pytest.fail(f"{variable} does not point to a file")
    return path


@pytest.fixture()
def remote_connection() -> psycopg.Connection[Any]:
    database_url = os.environ.get(DATABASE_URL_ENV)
    if not database_url:
        pytest.skip(f"{DATABASE_URL_ENV} is required for the remote integration target")

    connection = psycopg.connect(database_url, autocommit=False)
    try:
        with connection.cursor() as cursor:
            cursor.execute("set local role service_role")
            cursor.execute("select current_user")
            assert cursor.fetchone()[0] == "service_role"
            cursor.execute(
                "select to_regclass('core.source_attachments'), "
                "to_regclass('core.source_attachment_observations'), "
                "to_regclass('core.document_extractions'), "
                "to_regclass('core.parser_runs')"
            )
            assert all(value is not None for value in cursor.fetchone()), (
                "T02-B migration must be applied before running this integration test"
            )
        yield connection
    finally:
        connection.rollback()
        connection.close()


def insert_attachment_chain(
    connection: psycopg.Connection[Any],
    *,
    test_id: str,
    kind: str,
    path: Path,
    detected_format: str,
    magic_verified: bool = True,
) -> tuple[str, str]:
    data = path.read_bytes()
    document_sha256 = sha256_bytes(data)
    source_code = f"T02B_INTEGRATION_{test_id}"
    external_key = f"{kind}-{test_id}"
    source_url = f"https://t02b.invalid/{test_id}/{kind}/{path.name}"

    with connection.cursor() as cursor:
        cursor.execute(
            "insert into core.sources "
            "(source_code, name, source_type, base_url, is_official, active) "
            "values (%s, %s, 'integration_test', 'https://t02b.invalid', false, true) "
            "on conflict (source_code) do update set name = excluded.name "
            "returning source_id",
            (source_code, f"T02-B integration {test_id}"),
        )
        source_id = cursor.fetchone()[0]
        cursor.execute(
            "insert into core.source_records "
            "(source_id, external_key, title, page_url, raw_metadata) "
            "values (%s, %s, %s, %s, %s::jsonb) returning source_record_id",
            (source_id, external_key, path.name, source_url, json.dumps({"test_id": test_id})),
        )
        source_record_id = cursor.fetchone()[0]
        cursor.execute(
            "insert into core.documents "
            "(sha256, file_name, file_size_bytes, detected_format, magic_verified, "
            "extracted_text, extraction_result) "
            "values (%s, %s, %s, %s, %s, null, 'pending') "
            "on conflict (sha256) do nothing",
            (document_sha256, path.name, len(data), detected_format, magic_verified),
        )
        cursor.execute(
            "insert into core.document_urls "
            "(source_record_id, discovered_url, normalized_url, final_url, discovery_method) "
            "values (%s, %s, %s, %s, 'T02B_INTEGRATION') returning document_url_id",
            (source_record_id, source_url, source_url, source_url),
        )
        document_url_id = cursor.fetchone()[0]
        cursor.execute(
            "insert into core.document_url_observations "
            "(document_url_id, document_sha256, http_status, content_length) "
            "values (%s, %s, 200, %s) returning document_url_observation_id",
            (document_url_id, document_sha256, len(data)),
        )
        document_url_observation_id = cursor.fetchone()[0]
        cursor.execute(
            "insert into core.source_attachments "
            "(source_record_id, external_attachment_key, original_file_name) "
            "values (%s, %s, %s) returning attachment_id",
            (source_record_id, external_key, path.name),
        )
        attachment_id = cursor.fetchone()[0]
        cursor.execute(
            "insert into core.source_attachment_observations "
            "(attachment_id, document_url_observation_id, document_sha256) "
            "values (%s, %s, %s) returning attachment_observation_id",
            (attachment_id, document_url_observation_id, document_sha256),
        )
        attachment_observation_id = cursor.fetchone()[0]

    return str(attachment_observation_id), document_sha256


def run_parser_twice(
    runner: Callable[..., dict[str, Any]],
    path: Path,
    *,
    kind: str,
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    expected_sha256 = sha256_bytes(path.read_bytes())
    executions: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for _ in range(2):
        artifacts: list[dict[str, Any]] = []
        common = {
            "expected_sha256": expected_sha256,
            "file_name": path.name,
            "evidence_as_of": EVIDENCE_AS_OF,
            "lock_path": LOCK_PATH,
            "redact_roots": (path.parent,),
            "extraction_sink": artifacts.append,
        }
        if kind in {"hwp", "hwpx"}:
            common.update(regulation_name="T02B integration", aliases=[])
        record = runner(path, **common)
        assert record["result"] in {"SUCCESS", "IDENTITY_NOT_FOUND"}
        assert len(artifacts) == 1
        executions.append((record, artifacts[0]))

    assert executions[0][0]["extract_hash"] == executions[1][0]["extract_hash"]
    assert executions[0][1]["extracted_text"] == executions[1][1]["extracted_text"]
    return executions


def persist_execution(
    connection: psycopg.Connection[Any],
    attachment_observation_id: str,
    record: dict[str, Any],
    artifact: dict[str, Any] | None,
) -> str | None:
    with connection.cursor() as cursor:
        cursor.execute(
            "select core.record_parser_execution(%s, %s::jsonb, %s::jsonb)",
            (
                attachment_observation_id,
                json.dumps(record, ensure_ascii=False),
                json.dumps(artifact, ensure_ascii=False) if artifact is not None else None,
            ),
        )
        value = cursor.fetchone()[0]
    return str(value) if value is not None else None


@pytest.mark.integration
def test_actual_parsers_persist_one_artifact_per_binary_and_keep_every_run(
    remote_connection: psycopg.Connection[Any],
) -> None:
    samples = {
        "hwp": (required_path(SAMPLE_ENV["hwp"]), "hwp5", hwp_parser_runner.run_file),
        "hwpx": (required_path(SAMPLE_ENV["hwpx"]), "hwpx", hwpx_parser_runner.run_file),
        "pdf": (required_path(SAMPLE_ENV["pdf"]), "pdf", pdf_parser_runner.run_file),
    }
    test_id = uuid.uuid4().hex

    with remote_connection.cursor() as cursor:
        cursor.execute(
            "select count(*) from pg_catalog.pg_class c "
            "join pg_catalog.pg_namespace n on n.oid = c.relnamespace "
            "where n.nspname = 'core' and c.relname like 'mentions\\_%' escape '\\'"
        )
        assert cursor.fetchone()[0] == 0

    for kind, (path, detected_format, runner) in samples.items():
        observation_id, document_sha256 = insert_attachment_chain(
            remote_connection,
            test_id=test_id,
            kind=kind,
            path=path,
            detected_format=detected_format,
        )
        with remote_connection.cursor() as cursor:
            cursor.execute(
                "select count(*) from core.parser_runs where document_sha256 = %s",
                (document_sha256,),
            )
            runs_before = cursor.fetchone()[0]
            cursor.execute(
                "select count(*) from core.document_extractions where document_sha256 = %s",
                (document_sha256,),
            )
            extractions_before = cursor.fetchone()[0]
            cursor.execute(
                "select extracted_text from core.documents where sha256 = %s",
                (document_sha256,),
            )
            compatibility_text_before = cursor.fetchone()[0]

        executions = run_parser_twice(runner, path, kind=kind)
        extraction_ids = [
            persist_execution(remote_connection, observation_id, record, artifact)
            for record, artifact in executions
        ]

        assert extraction_ids[0] is not None
        assert extraction_ids[0] == extraction_ids[1]
        parser_run_ids = [record["parser_run_id"] for record, _ in executions]
        with remote_connection.cursor() as cursor:
            cursor.execute(
                "select count(*), count(extraction_id) from core.parser_runs "
                "where document_sha256 = %s",
                (document_sha256,),
            )
            run_count, linked_count = cursor.fetchone()
            assert run_count == runs_before + 2
            assert linked_count >= 2
            cursor.execute(
                "select count(*) from core.document_extractions where document_sha256 = %s",
                (document_sha256,),
            )
            assert cursor.fetchone()[0] == extractions_before + 1
            cursor.execute(
                "select extraction_contract_version from core.document_extractions "
                "where extraction_id = %s",
                (extraction_ids[0],),
            )
            assert cursor.fetchone()[0] == "v1.0"
            cursor.execute(
                "select count(*) from core.parser_runs pr "
                "join core.source_attachment_observations sao "
                "on sao.attachment_observation_id = pr.attachment_observation_id "
                "join core.source_attachments sa on sa.attachment_id = sao.attachment_id "
                "join core.document_url_observations duo "
                "on duo.document_url_observation_id = sao.document_url_observation_id "
                "join core.document_extractions de on de.extraction_id = pr.extraction_id "
                "where pr.parser_run_id in (%s, %s) "
                "and pr.document_sha256 = sao.document_sha256 "
                "and sao.document_sha256 = duo.document_sha256 "
                "and de.document_sha256 = pr.document_sha256",
                (parser_run_ids[0], parser_run_ids[1]),
            )
            assert cursor.fetchone()[0] == 2
            cursor.execute(
                "select extracted_text from core.documents where sha256 = %s",
                (document_sha256,),
            )
            assert cursor.fetchone()[0] == compatibility_text_before

    with remote_connection.cursor() as cursor:
        cursor.execute(
            "select count(*) from pg_catalog.pg_class c "
            "join pg_catalog.pg_namespace n on n.oid = c.relnamespace "
            "where n.nspname = 'core' and c.relname like 'mentions\\_%' escape '\\'"
        )
        assert cursor.fetchone()[0] == 0


@pytest.mark.integration
def test_no_extractable_text_keeps_run_without_empty_extraction(
    remote_connection: psycopg.Connection[Any],
    tmp_path: Path,
) -> None:
    blank_pdf = tmp_path / "t02b-no-extractable-text.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    with blank_pdf.open("wb") as stream:
        writer.write(stream)

    test_id = uuid.uuid4().hex
    observation_id, document_sha256 = insert_attachment_chain(
        remote_connection,
        test_id=test_id,
        kind="pdf-no-text",
        path=blank_pdf,
        detected_format="pdf",
    )
    artifacts: list[dict[str, Any]] = []
    record = pdf_parser_runner.run_file(
        blank_pdf,
        expected_sha256=document_sha256,
        file_name=blank_pdf.name,
        evidence_as_of=EVIDENCE_AS_OF,
        lock_path=LOCK_PATH,
        redact_roots=(tmp_path,),
        extraction_sink=artifacts.append,
    )
    assert record["result"] == "NO_EXTRACTABLE_TEXT"
    assert artifacts == []

    extraction_id = persist_execution(remote_connection, observation_id, record, None)
    assert extraction_id is None
    with remote_connection.cursor() as cursor:
        cursor.execute(
            "select parser_result, extraction_id from core.parser_runs "
            "where parser_run_id = %s",
            (record["parser_run_id"],),
        )
        assert cursor.fetchone() == ("NO_EXTRACTABLE_TEXT", None)
        cursor.execute(
            "select count(*) from core.document_extractions where document_sha256 = %s",
            (document_sha256,),
        )
        assert cursor.fetchone()[0] == 0


@pytest.mark.integration
def test_parser_failure_keeps_run_without_empty_extraction(
    remote_connection: psycopg.Connection[Any],
    tmp_path: Path,
) -> None:
    invalid_pdf = tmp_path / "t02b-magic-mismatch.pdf"
    invalid_pdf.write_bytes(b"not a pdf document")

    test_id = uuid.uuid4().hex
    observation_id, document_sha256 = insert_attachment_chain(
        remote_connection,
        test_id=test_id,
        kind="pdf-magic-mismatch",
        path=invalid_pdf,
        detected_format="other",
        magic_verified=False,
    )
    artifacts: list[dict[str, Any]] = []
    record = pdf_parser_runner.run_file(
        invalid_pdf,
        expected_sha256=document_sha256,
        file_name=invalid_pdf.name,
        evidence_as_of=EVIDENCE_AS_OF,
        lock_path=LOCK_PATH,
        redact_roots=(tmp_path,),
        extraction_sink=artifacts.append,
    )
    assert record["result"] == "EXTRACTION_FAILED"
    assert record["failure_domain"] == "INPUT_INTEGRITY"
    assert record["failure_code"] == "MAGIC_MISMATCH"
    assert artifacts == []

    extraction_id = persist_execution(remote_connection, observation_id, record, None)
    assert extraction_id is None
    with remote_connection.cursor() as cursor:
        cursor.execute(
            "select parser_result, extraction_id, failure_domain, failure_code "
            "from core.parser_runs where parser_run_id = %s",
            (record["parser_run_id"],),
        )
        assert cursor.fetchone() == (
            "EXTRACTION_FAILED",
            None,
            "INPUT_INTEGRITY",
            "MAGIC_MISMATCH",
        )
        cursor.execute(
            "select count(*) from core.document_extractions where document_sha256 = %s",
            (document_sha256,),
        )
        assert cursor.fetchone()[0] == 0
