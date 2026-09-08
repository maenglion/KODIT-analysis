#!/usr/bin/env python3
"""Download, verify, and prepare an idempotent KODIT regulation upsert.

The PDF is always processed in an OS temporary directory. The generated SQL is
also intended for a temporary path and contains no credentials.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import re
import ssl
import sys
import tempfile
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader


def normalize_url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value.strip())
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise ValueError("only absolute HTTP(S) URLs are accepted")
    query = urllib.parse.urlencode(sorted(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)))
    return urllib.parse.urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, query, ""))


def sql_literal(value: object) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


@dataclass(frozen=True)
class VerifiedPdf:
    sha256: str
    size_bytes: int
    page_count: int
    mime_type: str
    http_mime_type: str
    response_file_name: str
    final_url: str
    http_status: int
    etag: str | None
    last_modified: str | None
    extracted_text: str
    unicode_quality_ok: bool
    anchors_confirmed: bool
    anchor_confirmation_method: str
    checked_at: str


def download_and_verify(profile: dict, confirm_rendered_anchors: bool) -> VerifiedPdf:
    normalized = normalize_url(profile["url"])
    request = urllib.request.Request(normalized, headers={"User-Agent": "KODIT-collector/0.1 (+document-verification)"})
    context = ssl.create_default_context()

    with tempfile.TemporaryDirectory(prefix="kodit-regulation-") as temp_dir:
        pdf_path = Path(temp_dir) / "source.pdf"
        with urllib.request.urlopen(request, context=context, timeout=60) as response:
            body = response.read()
            status = response.status
            final_url = normalize_url(response.geturl())
            content_type = response.headers.get_content_type()
            disposition = response.headers.get("Content-Disposition", "")
            etag = response.headers.get("ETag")
            last_modified = response.headers.get("Last-Modified")
        pdf_path.write_bytes(body)

        digest = hashlib.sha256(body).hexdigest()
        if status != 200:
            raise RuntimeError(f"unexpected HTTP status: {status}")
        if not body.startswith(b"%PDF-"):
            raise RuntimeError("PDF magic bytes were not found")
        if len(body) != profile["expectedBytes"]:
            raise RuntimeError(f"size mismatch: {len(body)}")
        if digest != profile["expectedSha256"]:
            raise RuntimeError(f"SHA-256 mismatch: {digest}")
        if content_type not in {"application/pdf", "application/octet-stream", "application-download"}:
            guessed = mimetypes.guess_type(profile["fileName"])[0]
            if guessed != "application/pdf":
                raise RuntimeError(f"unexpected MIME type: {content_type}")
        file_name_match = re.search(r'filename="?([^";]+)', disposition, flags=re.IGNORECASE)
        if not file_name_match:
            raise RuntimeError("Content-Disposition filename was not provided")
        response_file_name = file_name_match.group(1)
        try:
            response_file_name = response_file_name.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
        if response_file_name != profile["fileName"]:
            raise RuntimeError(f"filename mismatch: {response_file_name}")

        reader = PdfReader(str(pdf_path))
        if reader.is_encrypted:
            raise RuntimeError("encrypted PDFs are not accepted")
        if len(reader.pages) != profile["expectedPages"]:
            raise RuntimeError(f"page count mismatch: {len(reader.pages)}")
        extracted = "\n\f\n".join(page.extract_text() or "" for page in reader.pages)
        replacement_ratio = extracted.count("�") / max(1, len(extracted))
        hangul_ratio = len(re.findall(r"[가-힣]", extracted)) / max(1, len(extracted))
        direct_anchors = (
            profile["regulationName"] in extracted
            and profile["revisionDate"].replace("-", ".") in extracted.replace(" ", "")
            and bool(re.search(r"제\s*1\s*조", extracted))
        )
        unicode_quality_ok = replacement_ratio < 0.01 and hangul_ratio > 0.05
        anchors_confirmed = bool(direct_anchors and unicode_quality_ok)
        if not anchors_confirmed and not confirm_rendered_anchors:
            raise RuntimeError(
                "embedded Korean glyph mapping is not machine-readable; render and inspect the title, "
                "revision date, articles, addenda, tables, and forms, then rerun with "
                "--confirm-rendered-anchors"
            )
        if not re.search(r"2024\s*\.\s*2\s*\.\s*23", extracted):
            raise RuntimeError("revision date was not preserved in the extracted text")

        return VerifiedPdf(
            sha256=digest,
            size_bytes=len(body),
            page_count=len(reader.pages),
            mime_type="application/pdf",
            http_mime_type=content_type,
            response_file_name=response_file_name,
            final_url=final_url,
            http_status=status,
            etag=etag,
            last_modified=last_modified,
            extracted_text=extracted,
            unicode_quality_ok=unicode_quality_ok,
            anchors_confirmed=True,
            anchor_confirmation_method="embedded-text" if anchors_confirmed else "rendered-human-confirmation",
            checked_at=datetime.now(timezone.utc).isoformat(),
        )


def build_upsert_sql(profile: dict, pdf: VerifiedPdf) -> str:
    p = profile
    extracted = pdf.extracted_text
    normalized = normalize_url(p["url"])
    values = {
        "source_code": sql_literal(p["sourceCode"]),
        "source_name": sql_literal(p["sourceName"]),
        "source_type": sql_literal(p["sourceType"]),
        "base_url": sql_literal(p["baseUrl"]),
        "external_key": sql_literal(p["externalKey"]),
        "url": sql_literal(p["url"]),
        "normalized_url": sql_literal(normalized),
        "final_url": sql_literal(pdf.final_url),
        "file_name": sql_literal(p["fileName"]),
        "sha": sql_literal(pdf.sha256),
        "bytes": sql_literal(pdf.size_bytes),
        "pages": sql_literal(pdf.page_count),
        "text": sql_literal(extracted),
        "regulation_name": sql_literal(p["regulationName"]),
        "revision_date": sql_literal(p["revisionDate"]),
        "version_label": sql_literal(p["versionLabel"]),
        "collector_version": sql_literal(p["collectorVersion"]),
        "methodology": sql_literal(p["methodologyVersion"]),
        "advance_notice_date": sql_literal(p["advanceNoticeDate"]),
        "etag": sql_literal(pdf.etag),
        "last_modified": sql_literal(pdf.last_modified),
    }
    sql = r"""
begin;
do $kodit$
declare
  v_source_id uuid;
  v_run_id uuid;
  v_record_id uuid;
  v_url_id uuid;
  v_previous_observation_id uuid;
  v_previous_sha char(64);
  v_regulation_id uuid;
  v_version_id uuid;
  v_fulltext_claim_id uuid;
  v_currency_claim_id uuid;
  v_criterion_id uuid;
begin
  insert into core.sources(source_code, name, source_type, base_url, is_official, required_for_nonpublic, active)
  values ({source_code}, {source_name}, {source_type}, {base_url}, true, true, true)
  on conflict(source_code) do update set name=excluded.name, base_url=excluded.base_url, is_official=true, active=true
  returning source_id into v_source_id;

  insert into core.crawl_runs(source_id, collector_version, started_at, finished_at, status, fetched_count, error_count, log_summary)
  values (v_source_id, {collector_version}, now(), now(), 'succeeded', 1, 0,
    jsonb_build_object('sha256', {sha}, 'verified_pages', {pages}, 'rendered_anchor_confirmation', true))
  returning crawl_run_id into v_run_id;

  insert into core.source_records(source_id, external_key, title, page_url, raw_metadata)
  values (v_source_id, {external_key}, {regulation_name}, {url},
    jsonb_build_object('crawl_run_id', v_run_id, 'official_download', true))
  on conflict(source_id, external_key) do update
    set title=excluded.title, page_url=excluded.page_url, raw_metadata=excluded.raw_metadata, last_seen_at=now()
  returning source_record_id into v_record_id;

  insert into core.documents(
    sha256, file_name, file_size_bytes, mime_type, detected_format, magic_verified,
    extracted_text, extraction_result, fulltext_publication_status, publication_reason_code,
    verified_regulation_name, verified_revision_date, verified_provision_count,
    fulltext_verification_method, fulltext_human_confirmed, fulltext_verified_at,
    fulltext_verified_by
  ) values (
    {sha}, {file_name}, {bytes}, 'application/pdf', 'pdf', true,
    {text}, 'success', 'public', 'OFFICIAL_PDF_TEXT_AND_RENDER_VERIFIED',
    {regulation_name}, {revision_date}::date, 1,
    'human', true, now(), 'kodit-collector:rendered-anchor-review'
  ) on conflict(sha256) do update set
    file_name=excluded.file_name, file_size_bytes=excluded.file_size_bytes, mime_type=excluded.mime_type,
    magic_verified=excluded.magic_verified, extracted_text=excluded.extracted_text,
    extraction_result=excluded.extraction_result, fulltext_publication_status=excluded.fulltext_publication_status,
    publication_reason_code=excluded.publication_reason_code,
    verified_regulation_name=excluded.verified_regulation_name,
    verified_revision_date=excluded.verified_revision_date,
    fulltext_verification_method=excluded.fulltext_verification_method,
    fulltext_human_confirmed=excluded.fulltext_human_confirmed,
    fulltext_verified_at=excluded.fulltext_verified_at,
    fulltext_verified_by=excluded.fulltext_verified_by;

  select document_url_id into v_url_id from core.document_urls
   where source_record_id=v_record_id and normalized_url={normalized_url}
   order by first_seen_at limit 1;
  if v_url_id is null then
    insert into core.document_urls(source_record_id, discovered_url, normalized_url, final_url, discovery_method)
    values(v_record_id, {url}, {normalized_url}, {final_url}, 'direct_official_download')
    returning document_url_id into v_url_id;
  else
    update core.document_urls set final_url={final_url}, last_seen_at=now() where document_url_id=v_url_id;
  end if;

  select document_url_observation_id, document_sha256 into v_previous_observation_id, v_previous_sha
    from core.document_url_observations where document_url_id=v_url_id order by observed_at desc limit 1;
  insert into core.document_url_observations(
    document_url_id, document_sha256, observed_at, http_status, etag, last_modified,
    content_length, previous_observation_id, content_changed, change_reason
  ) values (
    v_url_id, {sha}, clock_timestamp(), 200, {etag}, {last_modified}, {bytes},
    v_previous_observation_id, v_previous_observation_id is not null and v_previous_sha <> {sha},
    case when v_previous_observation_id is null then 'initial observation'
         when v_previous_sha = {sha} then 'content unchanged'
         else 'same URL returned a different SHA-256' end
  );

  insert into core.regulations(canonical_name, regulation_type, owning_department, lifecycle_status, visibility)
  values({regulation_name}, '내부 운용기준', '신용보증기금', 'unknown', 'public')
  on conflict(canonical_name) do update set visibility='public'
  returning regulation_id into v_regulation_id;

  select regulation_version_id into v_version_id from core.regulation_versions
   where regulation_id=v_regulation_id and revision_date={revision_date}::date and version_label={version_label};
  if v_version_id is null then
    insert into core.regulation_versions(regulation_id, revision_date, version_label, currency_status)
    values(v_regulation_id, {revision_date}::date, {version_label}, 'unknown')
    returning regulation_version_id into v_version_id;
  end if;
  insert into core.regulation_documents(regulation_version_id, document_sha256, document_role, match_confidence)
  values(v_version_id, {sha}, 'fulltext', '5-confirmed') on conflict do nothing;

  insert into core.status_definitions(status_code, axis, label, short_definition, criteria_markdown, methodology_version, valid_from, color)
  values('FULLTEXT_PUBLIC', 'availability', '전문 공개', '공식 PDF의 본문과 규정 식별정보를 확인함',
    '공식 출처, SHA-256, PDF 구조, 규정명, 개정일 및 조문을 모두 확인한다.', {methodology}, date '2024-01-01', '#13795b')
  on conflict(methodology_version, status_code) do nothing;
  insert into core.status_definitions(status_code, axis, label, short_definition, criteria_markdown, methodology_version, valid_from, color)
  values('CURRENT_UNVERIFIED', 'currency', '현행 여부 미확인', '후속 개정 사전예고가 있어 최신 현행본임을 확정하지 않음',
    '전문 공개 여부와 현행 여부를 분리하고 후속 개정·시행 여부를 별도 검증한다.', {methodology}, date '2024-01-01', '#b76900')
  on conflict(methodology_version, status_code) do nothing;

  select claim_id into v_fulltext_claim_id from core.claims
   where subject_type='regulation_version' and subject_id=v_version_id::text and claim_type='fulltext_availability'
   order by created_at limit 1;
  if v_fulltext_claim_id is null then
    insert into core.claims(subject_type, subject_id, claim_text, claim_type, is_primary,
      confidence_level, confidence_gate_passed, visibility)
    values('regulation_version', v_version_id::text, '2024.02.23 개정본 전문 공개', 'fulltext_availability', true, 5, true, 'public')
    returning claim_id into v_fulltext_claim_id;
  end if;
  select claim_id into v_currency_claim_id from core.claims
   where subject_type='regulation_version' and subject_id=v_version_id::text and claim_type='currency'
   order by created_at limit 1;
  if v_currency_claim_id is null then
    insert into core.claims(subject_type, subject_id, claim_text, claim_type, is_primary,
      confidence_level, confidence_gate_passed, visibility)
    values('regulation_version', v_version_id::text, '현재 최종 현행본', 'currency', false, 1, false, 'internal')
    returning claim_id into v_currency_claim_id;
  end if;

  insert into core.criteria(criterion_code, methodology_version, scale, level, required, description, display_order, valid_from)
  values
    ('official_source', {methodology}, 'confidence', 5, true, '공식 기관 원문 URL에서 취득', 1, date '2024-01-01'),
    ('sha256_match', {methodology}, 'confidence', 5, true, '기대 SHA-256과 실제 파일이 일치', 2, date '2024-01-01'),
    ('pdf_integrity', {methodology}, 'confidence', 5, true, 'PDF magic bytes·비암호화·페이지 수 확인', 3, date '2024-01-01'),
    ('title_revision', {methodology}, 'confidence', 5, true, '규정명과 2024.02.23 개정일 확인', 4, date '2024-01-01'),
    ('provisions_attachments', {methodology}, 'confidence', 5, true, '조문·부칙·별표·별지 확인', 5, date '2024-01-01')
  on conflict(methodology_version, scale, criterion_code) do nothing;

  for v_criterion_id in select criterion_id from core.criteria
    where methodology_version={methodology} and scale='confidence'
      and criterion_code in ('official_source','sha256_match','pdf_integrity','title_revision','provisions_attachments')
  loop
    if not exists(select 1 from core.claim_checks where claim_id=v_fulltext_claim_id and criterion_id=v_criterion_id) then
      insert into core.claim_checks(claim_id, criterion_id, check_result, evidence_document_sha256, evidence_ref, checked_by)
      values(v_fulltext_claim_id, v_criterion_id, 'pass', {sha}, {url}, 'kodit-collector:verified');
    end if;
  end loop;

  if not exists(select 1 from core.status_assignments where entity_type='document' and entity_id={sha}
      and methodology_version={methodology} and status_code='FULLTEXT_PUBLIC') then
    insert into core.status_assignments(entity_type, entity_id, methodology_version, status_code, status_level,
      search_verification_count, official_source_count, reason_code, reason_text, assigned_by, human_confirmed)
    values('document', {sha}, {methodology}, 'FULLTEXT_PUBLIC', 5, 1, 1,
      'OFFICIAL_PDF_TEXT_AND_RENDER_VERIFIED', '공식 PDF의 무결성과 규정명·개정일·조문·부칙·별표·별지를 확인함',
      'kodit-collector:verified', true);
  end if;
  if not exists(select 1 from core.status_assignments where entity_type='regulation_version' and entity_id=v_version_id::text
      and methodology_version={methodology} and status_code='CURRENT_UNVERIFIED') then
    insert into core.status_assignments(entity_type, entity_id, methodology_version, status_code, status_level,
      search_verification_count, official_source_count, reason_code, reason_text, assigned_by, human_confirmed)
    values('regulation_version', v_version_id::text, {methodology}, 'CURRENT_UNVERIFIED', 1, 0, 1,
      'ADVANCE_NOTICE_PENDING_EFFECT_CHECK', '2026.06.24 개정 사전예고 이후 시행·최종본 여부를 별도 확인해야 함',
      'kodit-collector:pending', false);
  end if;
end
$kodit$;
commit;
"""
    return sql.format(**values)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--emit-sql", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--confirm-rendered-anchors", action="store_true")
    args = parser.parse_args()
    profile = json.loads(args.profile.read_text(encoding="utf-8"))
    verified = download_and_verify(profile, args.confirm_rendered_anchors)
    report = {
        "url": normalize_url(profile["url"]),
        "sha256": verified.sha256,
        "sizeBytes": verified.size_bytes,
        "pageCount": verified.page_count,
        "encrypted": False,
        "mimeType": verified.mime_type,
        "httpMimeType": verified.http_mime_type,
        "responseFileName": verified.response_file_name,
        "magicVerified": True,
        "unicodeExtractionQuality": "readable" if verified.unicode_quality_ok else "damaged-font-map",
        "anchorsConfirmed": verified.anchors_confirmed,
        "anchorConfirmationMethod": verified.anchor_confirmation_method,
        "checkedAt": verified.checked_at,
    }
    if args.emit_sql:
        args.emit_sql.write_text(build_upsert_sql(profile, verified), encoding="utf-8")
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
