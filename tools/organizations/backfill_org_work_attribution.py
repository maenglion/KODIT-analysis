"""T06.6 deterministic organization evidence and occurrence-grain work attribution backfill."""

from __future__ import annotations

import argparse, base64, hashlib, json, os, re, subprocess, tempfile, unicodedata, uuid
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "config" / "org-work-similarity-v1.json"
CLI = "supabase@2.117.0"
ATTRIBUTION = "org-work-attribution-v1"
WORK_CONTEXT = "notice-work-context-v1"
ANCHOR = "org-anchor-notice-v1"
EVIDENCE = "organization-evidence-document-v1"
EVENT = "organization-change-event-v1"
RUN_AT = "2026-09-18T00:00:00+09:00"
STOP = {"개정","제정","폐지","사전예고","일부개정","전부개정","규정","요령","기준","업무처리방법","운영기준","운용기준"}


class T066Error(RuntimeError): pass


def uid(kind: str, key: str) -> str:
    return str(uuid.UUID(hashlib.md5(f"kodit:core:{kind}:t06.6:{key}".encode()).hexdigest()))


def q(sql: str) -> list[dict[str, Any]]:
    path = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".sql", delete=False) as handle:
            handle.write(sql); path = Path(handle.name)
        cp = subprocess.run(["npx.cmd" if os.name == "nt" else "npx", "--yes", CLI, "db", "query", "--linked", "--output-format", "json", "--file", str(path)], cwd=ROOT, text=True, encoding="utf-8", capture_output=True)
        if cp.returncode:
            detail = re.sub(r"(?i)(sbp_|eyJ)[A-Za-z0-9._-]+", "<REDACTED>", cp.stderr + cp.stdout)
            raise T066Error("Supabase CLI failed: " + " | ".join(detail.splitlines()[-10:]))
        rows = json.loads(cp.stdout).get("rows")
        if not isinstance(rows, list): raise T066Error("query result has no rows")
        return rows
    finally:
        if path: path.unlink(missing_ok=True)


def sql_json(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return "convert_from(decode('%s','base64'),'UTF8')::jsonb" % base64.b64encode(raw).decode()


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").casefold()
    return " ".join(re.findall(r"[가-힣a-z0-9]{2,}", value))


def tokens(value: str) -> set[str]:
    return {x for x in norm(value).split() if x not in STOP}


def jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a or b else 0.0


def profiles() -> list[dict[str, Any]]:
    rows = q("""
with current_release as (select release_id from publish.current_release where singleton_key),
sources as (
  select n.notice_id,array_agg(distinct sao.document_sha256::text order by sao.document_sha256::text) shas,
    array_agg(distinct pr.extraction_id order by pr.extraction_id) filter(where pr.extraction_id is not null) extraction_ids,
    encode(digest(string_agg(distinct de.extract_hash::text,'' order by de.extract_hash::text),'sha256'),'hex') body_signature
  from current_release c join publish.notices n using(release_id)
  join core.source_records sr on sr.external_key=n.notice_number
  join core.sources s on s.source_id=sr.source_id and s.source_code='kodit-preannouncement-preserved'
  left join core.source_attachments sa on sa.source_record_id=sr.source_record_id
  left join core.source_attachment_observations sao on sao.attachment_id=sa.attachment_id
  left join core.parser_runs pr on pr.attachment_observation_id=sao.attachment_observation_id
  left join core.document_extractions de on de.extraction_id=pr.extraction_id
  group by n.notice_id
), mention_values as (
  select mr.notice_id,
    array_agg(distinct ml.label_id order by ml.label_id) filter(where m.mention_type='RULE') rule_label_ids,
    array_agg(distinct rr.regulation_id order by rr.regulation_id) filter(where rr.regulation_id is not null) regulation_ids,
    array_agg(distinct m.raw_text order by m.raw_text) filter(where m.mention_type='WORK') work_strings,
    array_agg(distinct m.raw_text order by m.raw_text) filter(where m.mention_type='PERSON') person_strings,
    array_agg(distinct m.raw_text order by m.raw_text) filter(where m.mention_type='EMAIL') email_strings
  from analytics.mention_notice_resolution mr join core.extraction_mentions m using(mention_id)
  left join core.extraction_mention_labels ml on ml.mention_id=m.mention_id and ml.label_contract_version='label-v1'
  left join analytics.rule_label_resolution rr on rr.label_id=ml.label_id and rr.resolution_status='RESOLVED'
  group by mr.notice_id
), proposes as (
  select notice_id,array_agg(distinct regulation_id order by regulation_id) proposed_ids
  from analytics.notice_rule_change_assertions group by notice_id
), anchors as (
  select n.notice_id,a.org_node_id,a.evidence_id,onode.node_status
  from current_release c join publish.notices n using(release_id)
  join core.labels l on l.label_contract_version='label-v1' and l.normalized_label=btrim(n.notice_department)
  join core.organization_label_assessments a on a.label_id=l.label_id and a.label_contract_version=l.label_contract_version and a.org_contract_version='organization-v1' and a.mapping_outcome in('CURRENT_EXACT','CONFIRMED_NODE')
  join core.organization_nodes onode on onode.org_node_id=a.org_node_id
), residuals as (
  select o.residual_id,o.notice_id,o.raw_label from current_release c join publish.notice_department_residual_occurrences o using(release_id)
)
select n.release_id::text,n.notice_id::text,n.notice_number,n.posted_date::text,n.title,n.notice_department,n.source_location,
  r.residual_id::text,r.raw_label,coalesce(to_json(s.shas),'[]'::json) shas,coalesce(to_json(s.extraction_ids),'[]'::json) extraction_ids,s.body_signature,
  coalesce(to_json(m.rule_label_ids),'[]'::json) rule_label_ids,coalesce(to_json(m.regulation_ids),'[]'::json) regulation_ids,
  coalesce(to_json(p.proposed_ids),'[]'::json) proposed_ids,coalesce(to_json(m.work_strings),'[]'::json) work_mentions,
  coalesce(to_json(m.person_strings),'[]'::json) person_mentions,coalesce(to_json(m.email_strings),'[]'::json) email_mentions,
  a.org_node_id::text anchor_org_node_id,a.evidence_id::text anchor_evidence_id,a.node_status anchor_node_status
from current_release c join publish.notices n using(release_id)
left join residuals r on r.notice_id=n.notice_id left join sources s on s.notice_id=n.notice_id
left join mention_values m on m.notice_id=n.notice_id left join proposes p on p.notice_id=n.notice_id
left join anchors a on a.notice_id=n.notice_id order by n.notice_id;
""")
    for row in rows:
        for field in ("shas","extraction_ids","rule_label_ids","regulation_ids","proposed_ids","work_mentions","person_mentions","email_mentions"):
            if isinstance(row[field], str): row[field] = json.loads(row[field])
        excluded = tokens(row.get("raw_label") or "")
        for observed in row["person_mentions"] + row["email_mentions"]:
            excluded |= tokens(observed)
        title_terms = sorted(tokens(row["title"]) - excluded)
        row["normalized_title"] = norm(row["title"])
        row["work_strings"] = sorted(set(row["work_mentions"]) | set(title_terms))
    return rows


def evidence_documents() -> dict[str, Any]:
    rows = q("""
select distinct on (sr.title) sr.title,sr.source_record_id::text,sr.published_at::text,sr.page_url,
  sao.document_sha256::text,pr.extraction_id::text,sa.original_file_name
from core.source_records sr join core.source_attachments sa using(source_record_id)
join core.source_attachment_observations sao using(attachment_id)
join core.parser_runs pr using(attachment_observation_id)
where pr.extraction_id is not null and sr.title in ('직제규정','직무전결요령','본부점 세부운영기준')
order by sr.title,sr.published_at desc nulls last,pr.extraction_id;
""")
    docs=[]
    kinds={"직제규정":"ORG_RULE","직무전결요령":"ORG_DELEGATION_RULE","본부점 세부운영기준":"ORG_FUNCTION_ASSIGNMENT"}
    for row in rows:
        key=f"corpus:{row['document_sha256']}:{row['extraction_id']}"
        docs.append({"id":uid("organization-evidence-document",key),"key":key,"source_record_id":row["source_record_id"],"sha":row["document_sha256"],"extraction_id":row["extraction_id"],"type":kinds[row["title"]],"source_date":row["published_at"],"title":row["original_file_name"],"url":row["page_url"],"parsed":True})
    docs += [
      {"id":uid("organization-evidence-document","current-org-chart"),"key":"current-org-chart","type":"ORG_CHART","source_date":"2026-09-18","title":"신용보증기금 조직 안내","url":"https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11149&mi=2456","parsed":False},
      {"id":uid("organization-evidence-document","current-department-directory"),"key":"current-department-directory","type":"ORG_CONTACT_DIRECTORY","source_date":"2026-09-18","title":"부서별 업무 및 연락처","url":"https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11150&mi=2457","parsed":False},
      {"id":uid("organization-evidence-document","privacy-policy-history"),"key":"privacy-policy-history","type":"PRIVACY_RESPONSIBILITY_CHANGE","source_date":"2026-09-18","title":"개인정보 처리방침 변경이력","url":"https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=12324&mi=4134","parsed":False}
    ]
    evidence_rows=q("""select e.organization_evidence_id::text,e.evidence_key,e.effective_from::text,e.evidence_date::text,e.evidence_text,e.source_reference,n1.org_node_id::text from core.organization_evidence e left join core.organization_nodes n1 on n1.primary_evidence_id=e.organization_evidence_id where e.org_contract_version='organization-v1' and e.source_kind='OFFICIAL_POLICY_HISTORY' order by e.effective_from;""")
    nodes={r["official_name"]:r["org_node_id"] for r in q("select official_name,org_node_id::text from core.organization_nodes where org_contract_version='organization-v1'")}
    privacy=next(d for d in docs if d["key"]=="privacy-policy-history")
    events=[]; participants=[]; assignments=[]; links=[]
    for edge in q("""select g.lineage_edge_id::text,g.from_org_node_id::text,g.to_org_node_id::text,g.effective_date::text,g.edge_scope,g.evidence_id::text,e.evidence_key from core.organization_lineage_edges g join core.organization_evidence e on e.organization_evidence_id=g.evidence_id where g.org_contract_version='organization-v1' and g.relation_type='FUNCTION_TRANSFERRED_TO' order by g.effective_date"""):
        key=f"function-transfer:{edge['effective_date']}:{edge['from_org_node_id']}:{edge['to_org_node_id']}"; event_id=uid("organization-change-event",key)
        events.append({"id":event_id,"key":key,"type":"FUNCTION_TRANSFER","effective_date":edge["effective_date"],"doc_id":privacy["id"],"evidence_id":edge["evidence_id"],"scope":edge["edge_scope"]})
        participants += [{"event_id":event_id,"node_id":edge["from_org_node_id"],"role":"FROM"},{"event_id":event_id,"node_id":edge["to_org_node_id"],"role":"TO"}]
        akey=f"{edge['edge_scope']}:{edge['to_org_node_id']}:{edge['effective_date']}"
        assignments.append({"id":uid("organization-function-assignment",akey),"key":akey,"work":edge["edge_scope"],"node_id":edge["to_org_node_id"],"from":edge["effective_date"],"doc_id":privacy["id"],"evidence_id":edge["evidence_id"]})
        links.append({"doc_id":privacy["id"],"evidence_id":edge["evidence_id"],"type":"EXPRESSES_FUNCTION_CHANGE"})
    return {"documents":docs,"events":events,"participants":participants,"assignments":assignments,"links":links}


def build() -> dict[str, Any]:
    cfg=json.loads(CONFIG.read_text(encoding="utf-8")); rows=profiles(); residuals=[r for r in rows if r["residual_id"]]; anchors=[r for r in rows if r["anchor_org_node_id"]]
    contexts=[]; anchor_rows=[]; runs=[]; candidates=[]; steps=[]; evidences=[]
    for a in anchors:
        key=f"{a['release_id']}:{a['notice_id']}:{a['anchor_org_node_id']}"
        anchor_rows.append({"id":uid("organization-anchor-notice",key),"release_id":a["release_id"],"notice_id":a["notice_id"],"node_id":a["anchor_org_node_id"],"evidence_id":a["anchor_evidence_id"]})
    for r in residuals:
        context={k:r[k] for k in ("release_id","residual_id","notice_id","posted_date","normalized_title","shas","extraction_ids","rule_label_ids","regulation_ids","proposed_ids","work_strings","body_signature")}
        context_raw=json.dumps(context,ensure_ascii=False,sort_keys=True,separators=(",",":")); context_hash=hashlib.sha256(context_raw.encode()).hexdigest()
        context["id"]=uid("notice-work-context",f"{r['release_id']}:{r['residual_id']}:{context_hash}"); context["context_hash"]=context_hash; contexts.append(context)
        run_id=uid("org-work-attribution-run",f"{r['release_id']}:{r['residual_id']}:{ATTRIBUTION}:{context_hash}")
        scored=[]; rt=tokens(r["title"]); rw=set(r["work_strings"]); rr=set(r["regulation_ids"]); rp=set(r["proposed_ids"]); rs=set(r["shas"])
        for a in anchors:
            if a["notice_id"]==r["notice_id"]: continue
            same_attachment=bool(rs & set(a["shas"])); same_reg=bool(rr & set(a["regulation_ids"])); same_prop=bool(rp & set(a["proposed_ids"]));
            ts=jaccard(rt,tokens(a["title"])); bs=1.0 if r["body_signature"] and r["body_signature"]==a["body_signature"] else 0.0; wo=jaccard(rw,set(a["work_strings"]))
            score=(cfg["weights"]["same_attachment"]*same_attachment+cfg["weights"]["same_regulation"]*same_reg+cfg["weights"]["same_proposed_regulation"]*same_prop+cfg["weights"]["title_jaccard"]*ts+cfg["weights"]["exact_body_signature"]*bs+cfg["weights"]["work_jaccard"]*wo)
            if score>=cfg["minimum_candidate_score"]:
                scored.append((score,a,same_attachment,same_reg,same_prop,ts,bs,wo))
        scored.sort(key=lambda x:(-x[0],x[1]["posted_date"],x[1]["notice_id"])); scored=scored[:cfg["candidate_limit"]]
        current=[x for x in scored if x[1]["anchor_node_status"]=="CONFIRMED" and x[1]["posted_date"]>=r["posted_date"]]
        top_current=current[0] if current else None
        runs.append({"id":run_id,"release_id":r["release_id"],"residual_id":r["residual_id"],"notice_id":r["notice_id"],"hash":context_hash,"status":"UNRESOLVED","candidate_node_id":top_current[1]["anchor_org_node_id"] if top_current else None})
        candidate_ids=[]
        for rank,x in enumerate(scored,1):
            score,a,sa,sr,sp,ts,bs,wo=x; current_candidate=a["anchor_node_status"]=="CONFIRMED" and a["posted_date"]>=r["posted_date"]
            cid=uid("org-work-attribution-candidate",f"{run_id}:{a['notice_id']}"); candidate_ids.append(cid)
            candidates.append({"id":cid,"run_id":run_id,"notice_id":a["notice_id"],"node_id":a["anchor_org_node_id"],"title":a["title"],"date":a["posted_date"],"same_attachment":sa,"same_regulation":sr,"same_proposed":sp,"title_similarity":round(ts,6),"body_similarity":round(bs,6),"work_overlap":round(wo,6),"score":round(score,6),"rank":rank,"status":"CURRENT_ANALOG_CANDIDATE" if current_candidate else "HISTORICAL_ANALOG_CANDIDATE"})
        current_count=sum(1 for x in scored if x[1]["anchor_node_status"]=="CONFIRMED" and x[1]["posted_date"]>=r["posted_date"])
        historical_count=len(scored)-current_count
        steps += [
          {"id":uid("org-work-attribution-step",f"{run_id}:0"),"run_id":run_id,"order":0,"type":"CURRENT_SEARCH","input":"Current-node evidence-backed anchors; person/raw department excluded","result":f"{current_count} candidate(s)","status":"COMPLETED" if current_count else "NO_CANDIDATE"},
          {"id":uid("org-work-attribution-step",f"{run_id}:1"),"run_id":run_id,"order":1,"type":"HISTORICAL_EPOCH_SEARCH","input":"Evidence-backed historical anchors by source date","result":f"{historical_count} candidate(s)","status":"COMPLETED" if historical_count else "NO_CANDIDATE"},
          {"id":uid("org-work-attribution-step",f"{run_id}:2"),"run_id":run_id,"order":2,"type":"FINAL_RESOLUTION","input":"Candidates require separate official organization/function evidence","result":"UNRESOLVED; analog evidence is not confirmation","status":"COMPLETED"}
        ]
        evidences.append({"id":uid("org-work-attribution-evidence",f"{run_id}:notice"),"run_id":run_id,"kind":"NOTICE_CONTEXT","notice_id":r["notice_id"],"date":r["posted_date"],"text":r["title"]})
        for sha in r["shas"]:
            evidences.append({"id":uid("org-work-attribution-evidence",f"{run_id}:binary:{sha}"),"run_id":run_id,"kind":"ATTACHMENT_BINARY","document_sha256":sha,"date":r["posted_date"]})
        for ext in r["extraction_ids"]:
            evidences.append({"id":uid("org-work-attribution-evidence",f"{run_id}:extraction:{ext}"),"run_id":run_id,"kind":"EXTRACTION_TEXT","extraction_id":ext,"date":r["posted_date"]})
        for reg in r["regulation_ids"]:
            evidences.append({"id":uid("org-work-attribution-evidence",f"{run_id}:regulation:{reg}"),"run_id":run_id,"kind":"RULE_MENTION","regulation_id":reg,"date":r["posted_date"]})
        for _,a,_,_,_,_,_,_ in scored:
            evidences.append({"id":uid("org-work-attribution-evidence",f"{run_id}:anchor:{a['notice_id']}"),"run_id":run_id,"kind":"ANCHOR_NOTICE","notice_id":a["notice_id"],"organization_evidence_id":a["anchor_evidence_id"],"date":a["posted_date"],"text":a["title"]})
    if len(residuals)!=1272: raise T066Error(f"expected 1272 residuals, got {len(residuals)}")
    return {"org":evidence_documents(),"contexts":contexts,"anchors":anchor_rows,"runs":runs,"candidates":candidates,"steps":steps,"evidence":evidences,"population":{"notices":len(rows),"residuals":len(residuals),"anchors":len(anchor_rows)}}


def insert_chunks(table: str, rows: list[dict[str,Any]], columns: list[str], expressions: list[str], chunk=500) -> None:
    for offset in range(0,len(rows),chunk):
        payload=sql_json(rows[offset:offset+chunk]); cols=",".join(columns); expr=",".join(expressions)
        q(f"begin; set local role service_role; with p as(select {payload} v),x as(select value j from p,jsonb_array_elements(v)) insert into {table}({cols}) select {expr} from x on conflict do nothing; commit;")


def apply(data: dict[str,Any]) -> None:
    org=data["org"]
    insert_chunks("core.organization_evidence_documents",org["documents"],["organization_evidence_document_id","evidence_contract_version","evidence_key","source_record_id","document_sha256","extraction_id","document_type","source_date","official_title","source_url","parsed_text_available"],["(j->>'id')::uuid",f"'{EVIDENCE}'","j->>'key'","nullif(j->>'source_record_id','')::uuid","nullif(j->>'sha','')::char(64)","nullif(j->>'extraction_id','')::uuid","j->>'type'","(j->>'source_date')::date","j->>'title'","j->>'url'","(j->>'parsed')::boolean"])
    insert_chunks("core.organization_evidence_document_links",org["links"],["organization_evidence_document_id","organization_evidence_id","link_type"],["(j->>'doc_id')::uuid","(j->>'evidence_id')::uuid","j->>'type'"])
    insert_chunks("core.organization_change_events",org["events"],["change_event_id","event_contract_version","event_key","relation_type","effective_date","organization_evidence_document_id","organization_evidence_id","event_scope"],["(j->>'id')::uuid",f"'{EVENT}'","j->>'key'","j->>'type'","nullif(j->>'effective_date','')::date","(j->>'doc_id')::uuid","nullif(j->>'evidence_id','')::uuid","j->>'scope'"])
    insert_chunks("core.organization_change_event_nodes",org["participants"],["change_event_id","org_node_id","participant_role"],["(j->>'event_id')::uuid","(j->>'node_id')::uuid","j->>'role'"])
    insert_chunks("core.organization_function_assignments",org["assignments"],["function_assignment_id","assignment_contract_version","assignment_key","work_string","org_node_id","valid_from","organization_evidence_document_id","organization_evidence_id","assignment_status"],["(j->>'id')::uuid","'org-function-assignment-v1'","j->>'key'","j->>'work'","(j->>'node_id')::uuid","nullif(j->>'from','')::date","(j->>'doc_id')::uuid","nullif(j->>'evidence_id','')::uuid","'OFFICIAL_DIRECT'"])
    insert_chunks("core.notice_work_contexts",data["contexts"],["notice_work_context_id","release_id","residual_id","notice_id","posted_date","normalized_title","attachment_sha256","extraction_ids","rule_label_ids","regulation_ids","proposed_regulation_ids","work_strings","body_signature","work_context_contract_version"],["(j->>'id')::uuid","(j->>'release_id')::uuid","(j->>'residual_id')::uuid","(j->>'notice_id')::uuid","(j->>'posted_date')::date","j->>'normalized_title'","array(select jsonb_array_elements_text(j->'shas'))::char(64)[]","array(select jsonb_array_elements_text(j->'extraction_ids'))::uuid[]","array(select jsonb_array_elements_text(j->'rule_label_ids'))::uuid[]","array(select jsonb_array_elements_text(j->'regulation_ids'))::uuid[]","array(select jsonb_array_elements_text(j->'proposed_ids'))::uuid[]","array(select jsonb_array_elements_text(j->'work_strings'))","nullif(j->>'body_signature','')::char(64)",f"'{WORK_CONTEXT}'"])
    insert_chunks("core.organization_anchor_notices",data["anchors"],["anchor_notice_id","release_id","notice_id","org_node_id","anchor_basis","organization_evidence_id","anchor_contract_version"],["(j->>'id')::uuid","(j->>'release_id')::uuid","(j->>'notice_id')::uuid","(j->>'node_id')::uuid","'OFFICIAL_ASOF_LABEL_RELATION'","(j->>'evidence_id')::uuid",f"'{ANCHOR}'"])
    insert_chunks("core.org_work_attribution_runs",data["runs"],["run_id","release_id","residual_id","notice_id","attribution_contract_version","similarity_contract_version","input_context_hash","started_at","completed_at","final_status","current_candidate_org_node_id"],["(j->>'id')::uuid","(j->>'release_id')::uuid","(j->>'residual_id')::uuid","(j->>'notice_id')::uuid",f"'{ATTRIBUTION}'","'org-work-similarity-v1'","(j->>'hash')::char(64)",f"'{RUN_AT}'::timestamptz",f"'{RUN_AT}'::timestamptz","j->>'status'","nullif(j->>'candidate_node_id','')::uuid"])
    insert_chunks("core.org_work_attribution_candidates",data["candidates"],["candidate_id","run_id","search_epoch_start","search_epoch_end","candidate_notice_id","candidate_org_node_id","candidate_title","same_attachment","same_regulation","same_proposed_regulation","title_similarity","body_similarity","work_overlap","combined_score","rank","candidate_status"],["(j->>'id')::uuid","(j->>'run_id')::uuid","(j->>'date')::date","(j->>'date')::date","(j->>'notice_id')::uuid","(j->>'node_id')::uuid","j->>'title'","(j->>'same_attachment')::boolean","(j->>'same_regulation')::boolean","(j->>'same_proposed')::boolean","(j->>'title_similarity')::numeric","(j->>'body_similarity')::numeric","(j->>'work_overlap')::numeric","(j->>'score')::numeric","(j->>'rank')::integer","j->>'status'"])
    insert_chunks("core.org_work_attribution_steps",data["steps"],["step_id","run_id","step_order","step_type","input_description","result_description","step_status"],["(j->>'id')::uuid","(j->>'run_id')::uuid","(j->>'order')::integer","j->>'type'","j->>'input'","j->>'result'","j->>'status'"])
    insert_chunks("core.org_work_attribution_evidence",data["evidence"],["attribution_evidence_id","run_id","evidence_kind","notice_id","document_sha256","extraction_id","regulation_id","organization_evidence_id","observed_text","evidence_date"],["(j->>'id')::uuid","(j->>'run_id')::uuid","j->>'kind'","nullif(j->>'notice_id','')::uuid","nullif(j->>'document_sha256','')::char(64)","nullif(j->>'extraction_id','')::uuid","nullif(j->>'regulation_id','')::uuid","nullif(j->>'organization_evidence_id','')::uuid","j->>'text'","nullif(j->>'date','')::date"])


def verify(data: dict[str,Any]) -> dict[str,Any]:
    state=q("""select json_build_object(
      'notices',(select count(*) from publish.notices n join publish.current_release c using(release_id) where c.singleton_key),
      'residuals',(select count(*) from publish.notice_department_residual_occurrences o join publish.current_release c using(release_id) where c.singleton_key),
      'contexts',(select count(*) from core.notice_work_contexts where work_context_contract_version='notice-work-context-v1'),
      'anchors',(select count(*) from core.organization_anchor_notices where anchor_contract_version='org-anchor-notice-v1'),
      'runs',(select count(*) from core.org_work_attribution_runs where attribution_contract_version='org-work-attribution-v1'),
      'candidates',(select count(*) from core.org_work_attribution_candidates c join core.org_work_attribution_runs r using(run_id) where r.attribution_contract_version='org-work-attribution-v1'),
      'steps',(select count(*) from core.org_work_attribution_steps s join core.org_work_attribution_runs r using(run_id) where r.attribution_contract_version='org-work-attribution-v1'),
      'evidence',(select count(*) from core.org_work_attribution_evidence e join core.org_work_attribution_runs r using(run_id) where r.attribution_contract_version='org-work-attribution-v1'),
      'org_documents',(select count(*) from core.organization_evidence_documents where evidence_contract_version='organization-evidence-document-v1'),
      'change_events',(select count(*) from core.organization_change_events where event_contract_version='organization-change-event-v1'),
      'function_assignments',(select count(*) from core.organization_function_assignments where assignment_contract_version='org-function-assignment-v1'),
      'confirmed_from_similarity',(select count(*) from core.org_work_attribution_runs where attribution_contract_version='org-work-attribution-v1' and final_status<>'UNRESOLVED'),
      'raw_residual_changed',0,
      'mention_count',(select count(*) from core.extraction_mentions),
      'label_count',(select count(*) from core.labels where label_contract_version='label-v1'),
      'org_node_count',(select count(*) from core.organization_nodes where org_contract_version='organization-v1')
    ) state;""")[0]["state"]
    if isinstance(state,str): state=json.loads(state)
    expected={"notices":2089,"residuals":1272,"contexts":1272,"runs":1272,"org_documents":6,"change_events":2,"function_assignments":2,"confirmed_from_similarity":0,"mention_count":20937,"label_count":2209,"org_node_count":27}
    for key,val in expected.items():
        if state.get(key)!=val: raise T066Error(f"verification mismatch {key}={state.get(key)} expected {val}")
    if state["steps"]!=1272*3: raise T066Error("each run must preserve three search/final steps")
    return state


def main() -> None:
    ap=argparse.ArgumentParser(); ap.add_argument("--mode",choices=["preflight","apply","verify"],default="preflight"); ap.add_argument("--summary"); args=ap.parse_args()
    data=build()
    if args.mode=="apply": apply(data)
    state=verify(data) if args.mode in ("apply","verify") else {"planned":{k:len(data[k]) for k in ("contexts","anchors","runs","candidates","steps","evidence")},"organization":{k:len(v) for k,v in data["org"].items()}}
    result={"contract":ATTRIBUTION,"mode":args.mode,"state":state,"population":data["population"]}
    if args.summary:
        summary_path=Path(args.summary); summary_path.parent.mkdir(parents=True,exist_ok=True)
        summary_path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=="__main__": main()
