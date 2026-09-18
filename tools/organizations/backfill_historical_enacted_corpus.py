"""T06.8.3 official enacted organization-corpus acquisition and backfill.

The three ALIO rule pages are the canonical discovery records. Historical ZIP
members remain representations of those official attachments; proposals are
reconciled separately and are never promoted to enacted evidence.
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
import urllib.request
import uuid
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
COLLECTOR = ROOT / "workers" / "collector"
sys.path.insert(0, str(COLLECTOR))
from hwp_parser_runner import run_file  # noqa: E402

CONFIG_PATH = ROOT / "config" / "historical-enacted-org-corpus-v1.json"
CLI = "supabase@2.117.0"
CONTRACT = "historical-enacted-org-corpus-v1"
RUN_AT = "2026-09-18T00:00:00+09:00"
SERIES_TITLE = {
    "ORGANIZATION_RULE": "직제규정",
    "BRANCH_OPERATION": "본부점 세부운영기준",
    "DELEGATION": "직무전결요령",
}
DOCUMENT_TYPE = {
    "ORGANIZATION_RULE": "ORG_RULE",
    "BRANCH_OPERATION": "ORG_FUNCTION_ASSIGNMENT",
    "DELEGATION": "ORG_DELEGATION_RULE",
}


def uid(kind: str, key: str) -> str:
    return str(uuid.UUID(hashlib.md5(f"kodit:t06.8.3:{kind}:{key}".encode()).hexdigest()))


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sql_json(value: Any) -> str:
    raw = canonical(value).encode()
    return "convert_from(decode('%s','base64'),'UTF8')::jsonb" % base64.b64encode(raw).decode()


def q(sql: str) -> list[dict[str, Any]]:
    path = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".sql", delete=False) as handle:
            handle.write(sql)
            path = Path(handle.name)
        cp = subprocess.run(
            ["npx.cmd" if os.name == "nt" else "npx", "--yes", CLI, "db", "query", "--linked", "--output-format", "json", "--file", str(path)],
            cwd=ROOT, text=True, encoding="utf-8", capture_output=True,
        )
        if cp.returncode:
            raise RuntimeError("Supabase CLI failed: " + " | ".join((cp.stderr + cp.stdout).splitlines()[-12:]))
        rows = json.loads(cp.stdout).get("rows")
        if not isinstance(rows, list):
            raise RuntimeError("query did not return rows")
        return rows
    finally:
        if path:
            path.unlink(missing_ok=True)


def corpus_root() -> Path:
    explicit = os.getenv("KODIT_PRESERVED_CORPUS_ROOT")
    candidates = [
        Path(explicit) if explicit else None,
        Path(r"C:\Users\PC\OneDrive\사진\문서\신용보증기금\.verify\preannouncement_rule_match_20260831"),
    ]
    for candidate in candidates:
        if candidate and (candidate / "downloads").is_dir() and (candidate / "data").is_dir():
            return candidate
    raise RuntimeError("preserved corpus root not found")


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "KODIT-analysis/T06.8.3"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def materialize(config: dict[str, Any], root: Path) -> list[dict[str, Any]]:
    archive_bytes: dict[str, bytes] = {}
    archive_entries: dict[str, list[zipfile.ZipInfo]] = {}
    for series, metadata in config["archives"].items():
        url = f"https://www.alio.go.kr/download/rulefiledown.json?fileNo={metadata['file_no']}"
        data = fetch(url)
        archive_bytes[series] = data
        with zipfile.ZipFile(__import__("io").BytesIO(data)) as archive:
            archive_entries[series] = archive.infolist()

    rows: list[dict[str, Any]] = []
    for version in config["versions"]:
        series = version["series"]
        archive = config["archives"][series]
        if version.get("archive_index"):
            index = int(version["archive_index"])
            with zipfile.ZipFile(__import__("io").BytesIO(archive_bytes[series])) as zf:
                info = zf.infolist()[index - 1]
                data = zf.read(info)
                file_name = info.filename
            file_no = archive["file_no"]
            attachment_key = f"{file_no}:entry:{index}"
            url = f"https://www.alio.go.kr/download/rulefiledown.json?fileNo={file_no}#entry={index}"
        else:
            file_no = str(version["file_no"])
            url = f"https://www.alio.go.kr/download/rulefiledown.json?fileNo={file_no}"
            data = fetch(url)
            file_name = version["file_name"]
            attachment_key = file_no
        sha = hashlib.sha256(data).hexdigest()
        path = root / "downloads" / "alio-history" / archive["rule_id"] / f"{attachment_key.replace(':','-')}.hwp"
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() != sha:
            raise RuntimeError(f"preserved binary mismatch: {path}")
        if not path.exists():
            path.write_bytes(data)
        artifacts: list[dict[str, Any]] = []
        record = run_file(
            path, expected_sha256=sha, file_name=file_name,
            regulation_name=SERIES_TITLE[series], aliases=[],
            evidence_as_of=config["evidence_as_of"], lock_path=COLLECTOR / "requirements.txt",
            redact_roots=(root, ROOT), extraction_sink=artifacts.append,
        )
        if record["result"] not in ("SUCCESS", "IDENTITY_NOT_FOUND") or not artifacts:
            raise RuntimeError(f"parser failed for {file_name}: {record['result']} {record['error_message']}")
        run_id = uid("parser-run", f"{sha}:{CONTRACT}")
        record["parser_run_id"] = run_id
        artifacts[0]["parser_run_id"] = run_id
        rows.append({
            **version, "rule_id": archive["rule_id"], "file_no": file_no,
            "attachment_key": attachment_key, "file_name": file_name, "url": url,
            "sha256": sha, "size": len(data), "path": str(path),
            "record": record, "artifact": artifacts[0], "text": artifacts[0]["extracted_text"],
        })
    return rows


def setup_sources(rows: list[dict[str, Any]]) -> None:
    payload = [{
        "rule_id": row["rule_id"], "series": row["series"], "attachment_key": row["attachment_key"],
        "file_name": row["file_name"], "url": row["url"], "sha": row["sha256"], "size": row["size"],
        "source_record_id": uid("source-record", row["rule_id"]),
        "document_url_id": uid("document-url", row["url"]),
        "observation_id": uid("url-observation", row["sha256"] + ":" + row["url"]),
        "attachment_id": uid("attachment", row["rule_id"] + ":" + row["attachment_key"]),
        "attachment_observation_id": uid("attachment-observation", row["sha256"] + ":" + row["attachment_key"]),
    } for row in rows]
    q(f"""
begin; set local role service_role;
with p as(select {sql_json(payload)} v),x as(select value j from p,jsonb_array_elements(v)),s as(
 select source_id from core.sources where source_code='alio-internal-rules-preserved'
)
insert into core.source_records(source_record_id,source_id,external_key,title,published_at,page_url,raw_metadata)
select (j->>'source_record_id')::uuid,s.source_id,j->>'rule_id',j->>'series',null,
 'https://www.alio.go.kr/item/itemBoard21110.do?apbaId=C0091&bid_type=K1300&idx='||(j->>'rule_id')||'&idx_name=RULE_NO&nowcode=21110&reportFormNo=21110&reportGbn=N&table_name=COMM_RULE',
 jsonb_build_object('contract','{CONTRACT}') from x cross join s on conflict(source_id,external_key) do nothing;
with p as(select {sql_json(payload)} v),x as(select value j from p,jsonb_array_elements(v))
insert into core.documents(sha256,file_name,file_size_bytes,mime_type,detected_format,magic_verified,extraction_result,storage_path)
select j->>'sha',j->>'file_name',(j->>'size')::bigint,'application/x-hwp','hwp5',true,'success',null from x on conflict(sha256) do nothing;
with p as(select {sql_json(payload)} v),x as(select value j from p,jsonb_array_elements(v)),s as(
 select sr.source_record_id,sr.external_key from core.source_records sr join core.sources so using(source_id)
 where so.source_code='alio-internal-rules-preserved'
)
insert into core.document_urls(document_url_id,source_record_id,discovered_url,normalized_url,final_url,discovery_method,first_seen_at,last_seen_at)
select (j->>'document_url_id')::uuid,s.source_record_id,j->>'url',j->>'url',j->>'url','official_alio_historical_archive','{RUN_AT}','{RUN_AT}'
from x join s on s.external_key=j->>'rule_id' on conflict(document_url_id) do nothing;
with p as(select {sql_json(payload)} v),x as(select value j from p,jsonb_array_elements(v))
insert into core.document_url_observations(document_url_observation_id,document_url_id,document_sha256,observed_at,http_status,content_length,content_changed,change_reason)
select (j->>'observation_id')::uuid,(j->>'document_url_id')::uuid,j->>'sha','{RUN_AT}',200,(j->>'size')::bigint,false,'T06.8.3 official enacted corpus acquisition'
from x on conflict(document_url_observation_id) do nothing;
with p as(select {sql_json(payload)} v),x as(select value j from p,jsonb_array_elements(v)),s as(
 select sr.source_record_id,sr.external_key from core.source_records sr join core.sources so using(source_id)
 where so.source_code='alio-internal-rules-preserved'
)
insert into core.source_attachments(attachment_id,source_record_id,external_attachment_key,original_file_name)
select (j->>'attachment_id')::uuid,s.source_record_id,j->>'attachment_key',j->>'file_name' from x join s on s.external_key=j->>'rule_id'
on conflict(source_record_id,external_attachment_key) do nothing;
with p as(select {sql_json(payload)} v),x as(select value j from p,jsonb_array_elements(v)),a as(
 select sa.attachment_id,sr.external_key rule_id,sa.external_attachment_key from core.source_attachments sa
 join core.source_records sr using(source_record_id) join core.sources so using(source_id)
 where so.source_code='alio-internal-rules-preserved'
)
insert into core.source_attachment_observations(attachment_observation_id,attachment_id,document_url_observation_id,document_sha256)
select (j->>'attachment_observation_id')::uuid,a.attachment_id,(j->>'observation_id')::uuid,j->>'sha'
from x join a on a.rule_id=j->>'rule_id' and a.external_attachment_key=j->>'attachment_key'
on conflict(attachment_id,document_url_observation_id) do nothing;
commit;
""")


def record_extractions(rows: list[dict[str, Any]]) -> None:
    payload = []
    for row in rows:
        payload.append({
            "obs_id": uid("attachment-observation", row["sha256"] + ":" + row["attachment_key"]),
            "run": row["record"], "extraction": row["artifact"],
        })
    q(f"""
begin; set local role service_role;
with p as(select {sql_json(payload)} v),x as(select value j from p,jsonb_array_elements(v))
select core.record_parser_execution((j->>'obs_id')::uuid,j->'run',j->'extraction')
from x where not exists(select 1 from core.parser_runs r where r.parser_run_id=(j->'run'->>'parser_run_id')::uuid);
commit;
""")


def org_nodes() -> dict[str, str]:
    return {row["official_name"]: row["org_node_id"] for row in q("""
select distinct on (official_name) official_name,org_node_id::text from core.organization_nodes
where org_contract_version in ('organization-v1','organization-v1-evidence-r2')
order by official_name,(node_status='CONFIRMED') desc,org_node_id;
""")}


def function_blocks(text: str, nodes: dict[str, str]) -> list[tuple[str, str, int, int]]:
    marker = max(text.find("[별표 3]"), text.find("[별표3]"))
    if marker < 0:
        return []
    tail = text[marker:]
    positions = []
    for name in nodes:
        match = re.search(rf"(?m)^{re.escape(name)}\s*$\s*^1\.", tail)
        if match:
            positions.append((match.start(), name))
    positions.sort()
    blocks = []
    for index, (start, name) in enumerate(positions):
        end = positions[index + 1][0] if index + 1 < len(positions) else len(tail)
        blocks.append((name, tail[start:end], marker + start, marker + end))
    return blocks


def numbered_duties(block: str) -> list[tuple[int, str, str, int, int]]:
    """Return each exact numbered duty and its exact first-line evidence span.

    The full duty remains the immutable assignment work string.  The evidence
    span is the literal numbered first line at its real extraction offsets; it
    is neither a summary nor an arbitrary truncation of the source text.
    """
    marks = list(re.finditer(r"(?m)^([0-9]{1,2})\.\s*", block))
    result = []
    expected = 1
    for index, match in enumerate(marks):
        number = int(match.group(1))
        if number != expected:
            continue
        end = marks[index + 1].start() if index + 1 < len(marks) else len(block)
        phrase = block[match.start():end].strip()
        if phrase:
            first_line_end = block.find("\n", match.start(), end)
            if first_line_end < 0:
                first_line_end = end
            evidence_phrase = block[match.start():first_line_end].strip()
            if not evidence_phrase:
                continue
            # Existing span/observation uniqueness indexes are btree-backed.
            # A numbered heading this large is not a useful atomic observation;
            # fail closed instead of silently clipping official evidence.
            if len(evidence_phrase.encode("utf-8")) > 1500:
                raise RuntimeError(f"non-atomic duty heading exceeds contract: {evidence_phrase[:80]!r}")
            result.append((number, evidence_phrase, phrase, match.start(), first_line_end))
            expected += 1
    return result


def build_relations(rows: list[dict[str, Any]]) -> dict[str, Any]:
    nodes = org_nodes()
    series_ids = {row["series_code"]: row["document_series_id"] for row in q(
        "select series_code,document_series_id::text from core.organization_document_series where series_contract_version='organization-document-series-v1'"
    )}
    versions = []
    spans = []
    observations = []
    assignments = []
    function_evidence = []
    evidence_links = []
    profiles = []
    profile_links = []
    evidence_docs = []
    by_series: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        key = f"{row['series']}:{row['revision_date']}:{row['sha256']}"
        doc_id = uid("evidence-document", key)
        version_id = uid("document-version", key)
        extraction_id = q("select extraction_id::text from core.parser_runs where parser_run_id='%s'::uuid" % row["record"]["parser_run_id"])[0]["extraction_id"]
        item = dict(row, doc_id=doc_id, version_id=version_id, extraction_id=extraction_id)
        by_series.setdefault(row["series"], []).append(item)
        evidence_docs.append({"id":doc_id,"key":key,"rule_id":row["rule_id"],"sha":row["sha256"],"extraction_id":extraction_id,
                              "type":DOCUMENT_TYPE[row["series"]],"source_date":row["revision_date"],"effective_date":row.get("effective_date"),
                              "title":row["file_name"],"url":row["url"]})
    for series, items in by_series.items():
        items.sort(key=lambda item:(item["revision_date"],item["sha256"]))
        for index,item in enumerate(items):
            previous = items[index-1]["version_id"] if index else None
            versions.append({"id":item["version_id"],"doc_id":item["doc_id"],"title":item["file_name"],"revision":item["revision_date"],
                             "effective":item.get("effective_date"),"previous":previous,"series_id":series_ids[series]})
        if series != "BRANCH_OPERATION":
            continue
        profile_items = [item for item in items if item.get("effective_date")]
        profile_items.sort(key=lambda item:item["effective_date"])
        for index,item in enumerate(profile_items):
            valid_to = profile_items[index+1]["effective_date"] if index+1<len(profile_items) else "2026-07-02"
            profile_id = uid("temporal-profile", item["version_id"])
            profiles.append({"id":profile_id,"key":f"branch:{item['effective_date']}","version_id":item["version_id"],
                             "series_id":series_ids[series],"from":item["effective_date"],"to":valid_to})
            for name,block,start,end in function_blocks(item["text"],nodes):
                evidence_id = uid("function-evidence", f"{item['doc_id']}:{nodes[name]}")
                function_evidence.append({"id":evidence_id,"key":f"historical-enacted-function:{item['doc_id']}:{nodes[name]}",
                                          "doc_id":item["doc_id"],"node_id":nodes[name],"name":name,
                                          "date":item["effective_date"],"locator":f"[별표3] {name}"})
                evidence_links.append({"doc_id":item["doc_id"],"evidence_id":evidence_id})
                for number,evidence_phrase,full_phrase,relative_start,relative_end in numbered_duties(block):
                    span_id = uid("function-span", f"{item['doc_id']}:{name}:{number}")
                    spans.append({"id":span_id,"doc_id":item["doc_id"],"extraction_id":item["extraction_id"],
                                  "locator":f"[별표3] {name} {number}","start":start+relative_start,
                                  "end":start+relative_end,"text":evidence_phrase,"type":"FUNCTION_ASSIGNMENT"})
                    observation_id=uid("function-observation",f"{item['doc_id']}:{nodes[name]}:{number}")
                    assignment_id=uid("function-assignment",f"{item['doc_id']}:{nodes[name]}:{number}")
                    observations.append({"id":observation_id,"doc_id":item["doc_id"],"node_id":nodes[name],"span_id":span_id,
                                         "phrase":evidence_phrase,"from":item["effective_date"],"to":valid_to})
                    assignments.append({"id":assignment_id,"key":f"historical:{item['effective_date']}:{name}:{number}","phrase":full_phrase,
                                        "node_id":nodes[name],"from":item["effective_date"],"to":valid_to,"doc_id":item["doc_id"],
                                        "evidence_id":evidence_id})
                    profile_links.append({"profile_id":profile_id,"assignment_id":assignment_id,"span_id":span_id})
    proposals = q("""
select d.organization_evidence_document_id::text proposal_id,d.source_date::text,
  array_agg(distinct s.document_series_id::text) series_ids
from core.organization_evidence_documents d join core.organization_document_versions v using(organization_evidence_document_id)
join core.organization_document_version_series l using(document_version_id)
join core.organization_document_series s using(document_series_id)
where d.document_type='ORG_REORGANIZATION_NOTICE'
group by d.organization_evidence_document_id,d.source_date order by d.source_date;
""")
    enacted_by_series = {series_ids[k]: sorted(v,key=lambda x:x["revision_date"]) for k,v in by_series.items()}
    reconciliations=[]
    proposal_summary={}
    for proposal in proposals:
        statuses=[]
        for series_id in proposal["series_ids"]:
            candidates=[item for item in enacted_by_series.get(series_id,[]) if item["revision_date"]>=proposal["source_date"]]
            candidate=candidates[0] if candidates and (date.fromisoformat(candidates[0]["revision_date"])-date.fromisoformat(proposal["source_date"])).days<=190 else None
            status="ENACTED_MATCHED" if candidate else "NO_ENACTED_VERSION_FOUND"
            statuses.append(status)
            reconciliations.append({"id":uid("reconciliation",f"{proposal['proposal_id']}:{series_id}"),"proposal_id":proposal["proposal_id"],
                                    "enacted_id":candidate["doc_id"] if candidate else None,"series_id":series_id,"status":status,
                                    "basis":"official ALIO enacted series version within 190 days" if candidate else "no official enacted version in acquired corpus within 190 days"})
        proposal_summary[proposal["proposal_id"]]="ENACTED_MATCHED" if statuses and all(s=="ENACTED_MATCHED" for s in statuses) else "NO_ENACTED_VERSION_FOUND"
    return {"documents":evidence_docs,"versions":versions,"spans":spans,"observations":observations,
            "function_evidence":function_evidence,"evidence_links":evidence_links,"assignments":assignments,
            "profiles":profiles,"profile_links":profile_links,"reconciliations":reconciliations,"proposal_summary":proposal_summary}


def apply_relations(data: dict[str, Any]) -> None:
    statements = {
        "documents": "insert into core.organization_evidence_documents(organization_evidence_document_id,evidence_contract_version,evidence_key,source_record_id,document_sha256,extraction_id,document_type,source_date,effective_date,official_title,source_url,parsed_text_available) select (j->>'id')::uuid,'organization-evidence-document-v1',j->>'key',sr.source_record_id,j->>'sha',(j->>'extraction_id')::uuid,j->>'type',(j->>'source_date')::date,nullif(j->>'effective_date','')::date,j->>'title',j->>'url',true from x join core.source_records sr on sr.external_key=j->>'rule_id' join core.sources s using(source_id) where s.source_code='alio-internal-rules-preserved' on conflict do nothing",
        "versions": "insert into core.organization_document_versions(document_version_id,version_contract_version,organization_evidence_document_id,official_title,revision_date,effective_date,previous_version_id,version_status) select (j->>'id')::uuid,'organization-document-version-v1',(j->>'doc_id')::uuid,j->>'title',(j->>'revision')::date,nullif(j->>'effective','')::date,nullif(j->>'previous','')::uuid,'HISTORICAL_FULLTEXT' from x on conflict do nothing",
        "spans": "insert into core.organization_evidence_spans(evidence_span_id,span_contract_version,organization_evidence_document_id,extraction_id,source_locator,span_start,span_end,observed_text,observation_type,evidence_quality) select (j->>'id')::uuid,'organization-evidence-span-v1',(j->>'doc_id')::uuid,(j->>'extraction_id')::uuid,j->>'locator',(j->>'start')::integer,(j->>'end')::integer,j->>'text',j->>'type','OFFICIAL_DIRECT' from x on conflict do nothing",
        "observations": "insert into core.organization_function_observations(function_observation_id,observation_contract_version,organization_evidence_document_id,org_node_id,evidence_span_id,raw_function_phrase,normalized_lexical_form,evidence_type,valid_from,valid_to) select (j->>'id')::uuid,'organization-function-observation-v2',(j->>'doc_id')::uuid,(j->>'node_id')::uuid,(j->>'span_id')::uuid,j->>'phrase',regexp_replace(lower(j->>'phrase'),'[^가-힣a-z0-9]+','','g'),'DIRECT_FUNCTION_ASSIGNMENT',(j->>'from')::date,nullif(j->>'to','')::date from x on conflict do nothing",
        "function_evidence": "insert into core.organization_evidence(organization_evidence_id,org_contract_version,evidence_key,source_kind,source_record_id,source_reference,observed_name,evidence_date,effective_from,effective_to,evidence_strength,evidence_text,evidence_metadata) select (j->>'id')::uuid,'organization-v1-evidence-r2',j->>'key','OFFICIAL_CORPUS_MENTION',d.source_record_id,d.source_url,j->>'name',(j->>'date')::date,(j->>'date')::date,null,'OFFICIAL_DIRECT','본부점 세부운영기준 별표3 부서별 직무명세서 시행본 직접 관측',jsonb_build_object('document_id',j->>'doc_id','locator',j->>'locator') from x join core.organization_evidence_documents d on d.organization_evidence_document_id=(j->>'doc_id')::uuid on conflict do nothing",
        "evidence_links": "insert into core.organization_evidence_document_links(organization_evidence_document_id,organization_evidence_id,link_type) select (j->>'doc_id')::uuid,(j->>'evidence_id')::uuid,'SUPPORTS' from x on conflict do nothing",
        "assignments": "insert into core.organization_function_assignments(function_assignment_id,assignment_contract_version,assignment_key,work_string,org_node_id,valid_from,valid_to,organization_evidence_document_id,organization_evidence_id,assignment_status) select (j->>'id')::uuid,'org-function-assignment-v4',j->>'key',j->>'phrase',(j->>'node_id')::uuid,(j->>'from')::date,nullif(j->>'to','')::date,(j->>'doc_id')::uuid,(j->>'evidence_id')::uuid,'OFFICIAL_DIRECT' from x on conflict do nothing",
        "profiles": "insert into core.temporal_function_profiles(temporal_profile_id,profile_contract_version,profile_key,document_version_id,document_series_id,valid_from,valid_to,profile_status) select (j->>'id')::uuid,'temporal-function-profile-v2',j->>'key',(j->>'version_id')::uuid,(j->>'series_id')::uuid,(j->>'from')::date,nullif(j->>'to','')::date,'OFFICIAL_ENACTED' from x on conflict do nothing",
        "reconciliations": f"insert into core.organization_proposal_reconciliations(reconciliation_id,reconciliation_contract_version,proposal_document_id,enacted_document_id,document_series_id,reconciliation_status,reconciliation_basis,compared_at) select (j->>'id')::uuid,'proposal-enacted-reconciliation-v1',(j->>'proposal_id')::uuid,nullif(j->>'enacted_id','')::uuid,(j->>'series_id')::uuid,j->>'status',j->>'basis','{RUN_AT}' from x on conflict do nothing",
    }
    limits={"spans":100,"observations":100,"function_evidence":100,"evidence_links":100,"assignments":100,
            "reconciliations":100,"documents":50,"versions":50,"profiles":50}
    for key,statement in statements.items():
        rows=data[key]; size=limits[key]
        for offset in range(0,len(rows),size):
            payload=sql_json(rows[offset:offset+size])
            q(f"begin; set local role service_role; with x as(select value j from jsonb_array_elements({payload})) {statement}; commit;")
    for offset in range(0,len(data["versions"]),50):
        payload=sql_json(data["versions"][offset:offset+50])
        q(f"begin; set local role service_role; with x as(select value j from jsonb_array_elements({payload})) insert into core.organization_document_version_series(document_version_id,document_series_id,series_relation) select (j->>'id')::uuid,(j->>'series_id')::uuid,'VERSION_OF' from x on conflict do nothing; commit;")
    links=data["profile_links"]
    for offset in range(0,len(links),200):
        payload=sql_json(links[offset:offset+200])
        q(f"""begin; set local role service_role;
with x as(select value j from jsonb_array_elements({payload})) insert into core.organization_function_assignment_spans(function_assignment_id,evidence_span_id) select (j->>'assignment_id')::uuid,(j->>'span_id')::uuid from x on conflict do nothing;
with x as(select value j from jsonb_array_elements({payload})) insert into core.temporal_function_profile_assignments(temporal_profile_id,function_assignment_id) select (j->>'profile_id')::uuid,(j->>'assignment_id')::uuid from x on conflict do nothing; commit;""")


def verify(data: dict[str, Any]) -> dict[str, Any]:
    state=q("""
select json_build_object(
 'documents',(select count(*) from core.organization_evidence_documents where evidence_key like 'ORGANIZATION_%:%' or evidence_key like 'BRANCH_%:%' or evidence_key like 'DELEGATION:%'),
 'versions',(select count(*) from core.organization_document_versions where version_contract_version='organization-document-version-v1' and version_status='HISTORICAL_FULLTEXT' and revision_date between '2022-01-01' and '2025-12-31'),
 'profiles',(select count(*) from core.temporal_function_profiles where profile_contract_version='temporal-function-profile-v2'),
 'assignments',(select count(*) from core.organization_function_assignments where assignment_contract_version='org-function-assignment-v4'),
 'reconciliations',(select count(*) from core.organization_proposal_reconciliations where reconciliation_contract_version='proposal-enacted-reconciliation-v1'),
 'broken_profile_fk',(select count(*) from core.temporal_function_profile_assignments l left join core.organization_function_assignments a using(function_assignment_id) where a.function_assignment_id is null),
 'prior_t0682_unchanged',(
   (select count(*) from core.organization_function_assignments where assignment_contract_version='org-function-assignment-v2')=203
   and (select count(*) from core.organization_function_assignments where assignment_contract_version='org-function-assignment-v3')=3
 )
) state;
""")[0]["state"]
    if isinstance(state,str): state=json.loads(state)
    if state["documents"]<31 or state["profiles"]<10 or state["assignments"]<1 or state["broken_profile_fk"]!=0 or not state["prior_t0682_unchanged"]:
        raise RuntimeError(f"verification failed: {state}")
    return state


def main() -> None:
    parser=argparse.ArgumentParser(); parser.add_argument("--mode",choices=("preflight","apply","verify"),default="preflight"); parser.add_argument("--output"); args=parser.parse_args()
    config=json.loads(CONFIG_PATH.read_text(encoding="utf-8")); root=corpus_root(); rows=materialize(config,root)
    if args.mode=="apply":
        setup_sources(rows); record_extractions(rows); data=build_relations(rows); apply_relations(data)
    else:
        data=build_relations(rows) if args.mode=="verify" else {"proposal_summary":{},"documents":rows,"profiles":[]}
    state=verify(data) if args.mode in ("apply","verify") else {"planned_documents":len(rows)}
    summary={"contract":CONTRACT,"mode":args.mode,"state":state,"proposal_distribution":dict(__import__('collections').Counter(data.get('proposal_summary',{}).values())),
             "series_years":dict(__import__('collections').Counter(f"{r['series']}:{r['revision_date'][:4]}" for r in rows)),
             "official_effective_dates":sum(bool(r.get('effective_date')) for r in rows)}
    if args.output:
        path=Path(args.output); path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
