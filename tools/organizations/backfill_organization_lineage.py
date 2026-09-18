"""T05 evidence-backed organization nodes and lineage via linked Supabase CLI OAuth."""

from __future__ import annotations

import argparse, base64, hashlib, json, os, re, subprocess, tempfile, uuid
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CONFIG = Path(__file__).with_name("organization-v1.json")
CLI = "supabase@2.117.0"


class T05Error(RuntimeError): pass


def uid(kind: str, key: str) -> str:
    return str(uuid.UUID(hashlib.md5(f"kodit:core:{kind}:organization-v1:{key}".encode()).hexdigest()))


def q(sql: str) -> list[dict[str, Any]]:
    path = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".sql", delete=False) as f:
            f.write(sql); path = Path(f.name)
        cp = subprocess.run(["npx.cmd" if os.name == "nt" else "npx", "--yes", CLI,
            "db", "query", "--linked", "--output-format", "json", "--file", str(path)],
            cwd=ROOT, text=True, encoding="utf-8", capture_output=True)
        if cp.returncode:
            detail = re.sub(r"(?i)(sbp_|eyJ)[A-Za-z0-9._-]+", "<REDACTED>", cp.stderr + cp.stdout)
            raise T05Error("Supabase CLI failed: " + " | ".join(detail.splitlines()[-8:]))
        rows = json.loads(cp.stdout).get("rows")
        if not isinstance(rows, list): raise T05Error("query result has no rows")
        return rows
    finally:
        if path: path.unlink(missing_ok=True)


def sql_json(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return "convert_from(decode('%s','base64'),'UTF8')::jsonb" % base64.b64encode(raw).decode()


def fetch_labels() -> list[dict[str, Any]]:
    return q("""
select m.label_id::text,m.normalized_label,m.first_seen_at,m.last_seen_at,
       m.kodit_notice_count,m.mention_occurrence_count,m.department_residual_occurrence_count
from core.label_metrics m join core.label_type_evidence e using(label_id,label_contract_version)
where m.label_contract_version='label-v1' and e.resolved_label_type='ORG'
order by m.normalized_label;
""")


def historical_evidence(names: set[str]) -> dict[str, dict[str, Any]]:
    quoted = ",".join("'%s'" % x.replace("'", "''") for x in sorted(names))
    rows = q(f"""
select distinct on (l.normalized_label) l.normalized_label,
       m.mention_id::text,sr.source_record_id::text,sr.page_url,
       sr.published_at::date::text evidence_date
from core.labels l join core.extraction_mention_labels ml using(label_id,label_contract_version)
join core.extraction_mentions m on m.mention_id=ml.mention_id
join core.parser_runs pr on pr.extraction_id=m.extraction_id
join core.source_attachment_observations sao on sao.attachment_observation_id=pr.attachment_observation_id
join core.source_attachments sa on sa.attachment_id=sao.attachment_id
join core.source_records sr on sr.source_record_id=sa.source_record_id
join core.sources s on s.source_id=sr.source_id
where l.label_contract_version='label-v1' and l.normalized_label in ({quoted})
  and m.raw_text=l.normalized_label and s.source_code='kodit-preannouncement-preserved'
  and sr.page_url ~ '^https?://'
order by l.normalized_label,sr.published_at nulls last,m.mention_id;
""")
    found = {r["normalized_label"]: r for r in rows}
    if set(found) != names: raise T05Error(f"missing exact official corpus evidence: {sorted(names-set(found))}")
    return found


def build() -> dict[str, Any]:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8")); labels = fetch_labels()
    by_name = {r["normalized_label"]: r for r in labels}
    current = set(cfg["current_snapshot"]["names"]); historical = set(cfg["historical_names"])
    unresolved = cfg["unresolved_labels"]
    if len(labels) != 40 or set(by_name) != current | historical | set(unresolved):
        raise T05Error("organization-v1 does not exhaustively partition the 40 ORG labels")

    evidence=[]; nodes=[]; assessments=[]; relations=[]; evidence_by_name={}; node_by_name={}
    historical_rows = historical_evidence(historical)
    for name in sorted(current):
        key=f"current-page:{name}"; eid=uid("organization-evidence",key)
        evidence.append({"id":eid,"key":key,"kind":"OFFICIAL_CURRENT_ORGANIZATION_PAGE",
          "source_reference":cfg["current_snapshot"]["source_reference"],"observed_name":name,
          "evidence_date":cfg["current_snapshot"]["evidence_date"],"strength":"OFFICIAL_DIRECT",
          "evidence_text":f"현재 공식 부서별 업무 및 연락처 페이지에 {name} 표시","metadata":{"snapshot":"current"}})
        evidence_by_name[name]=eid
    for name in sorted(historical):
        h=historical_rows[name]; key=f"corpus-mention:{h['mention_id']}"; eid=uid("organization-evidence",key)
        evidence.append({"id":eid,"key":key,"kind":"OFFICIAL_CORPUS_MENTION",
          "source_record_id":h["source_record_id"],"mention_id":h["mention_id"],
          "source_reference":h["page_url"],"observed_name":name,"evidence_date":h["evidence_date"],
          "strength":"CORPUS_CORROBORATION","metadata":{"exact_mention":True}})
        evidence_by_name[name]=eid
    for edge in cfg["lineage_evidence"]["edges"]:
        key=f"policy-history:{edge['effective_date']}:{edge['from']}:{edge['to']}"; eid=uid("organization-evidence",key)
        evidence.append({"id":eid,"key":key,"kind":"OFFICIAL_POLICY_HISTORY",
          "source_reference":cfg["lineage_evidence"]["source_reference"],"observed_name":edge["to"],
          "evidence_date":edge["effective_date"],"effective_from":edge["effective_date"],
          "strength":"OFFICIAL_DIRECT","evidence_text":edge["evidence_text"],"metadata":{"scope":edge["edge_scope"]}})
        edge["evidence_id"]=eid

    for name in sorted(current | historical):
        nid=uid("organization-node",name); node_by_name[name]=nid
        nodes.append({"id":nid,"key":name,"name":name,"status":"CONFIRMED" if name in current else "PARTIAL_WINDOW",
                      "evidence_id":evidence_by_name[name]})
        row=by_name[name]; outcome="CURRENT_EXACT" if name in current else "CONFIRMED_NODE"
        assessments.append({"label_id":row["label_id"],"outcome":outcome,"node_id":nid,
          "evidence_id":evidence_by_name[name],"first":row["first_seen_at"],"last":row["last_seen_at"]})
        relations.append({"id":uid("organization-label-node",row["label_id"]+":"+nid),
          "label_id":row["label_id"],"node_id":nid,"basis":"CURRENT_OFFICIAL_SNAPSHOT" if name in current else "SOURCE_OBSERVATION_RANGE",
          "first":row["first_seen_at"],"last":row["last_seen_at"],"evidence_id":evidence_by_name[name]})
    for name,reason in sorted(unresolved.items()):
        row=by_name[name]; assessments.append({"label_id":row["label_id"],"outcome":"UNRESOLVED","reason":reason,
          "first":row["first_seen_at"],"last":row["last_seen_at"]})
    edges=[]
    for edge in cfg["lineage_evidence"]["edges"]:
        seed=f"{node_by_name[edge['from']]}:{node_by_name[edge['to']]}:{edge['relation_type']}:{edge['effective_date']}:{edge['edge_scope']}"
        edges.append({**edge,"id":uid("organization-lineage-edge",seed),
                      "from_id":node_by_name[edge["from"]],"to_id":node_by_name[edge["to"]]})
    return {"labels":labels,"evidence":evidence,"nodes":nodes,"assessments":assessments,"relations":relations,"edges":edges}


def apply(data: dict[str, Any]) -> None:
    p=sql_json(data)
    q(f"""
begin; set local role service_role; with p as (select {p} v),
e as (select x from p,jsonb_array_elements(v->'evidence') x)
insert into core.organization_evidence(organization_evidence_id,org_contract_version,evidence_key,source_kind,source_record_id,mention_id,source_reference,observed_name,evidence_date,effective_from,evidence_strength,evidence_text,evidence_metadata)
select (x->>'id')::uuid,'organization-v1',x->>'key',x->>'kind',nullif(x->>'source_record_id','')::uuid,nullif(x->>'mention_id','')::uuid,x->>'source_reference',x->>'observed_name',(x->>'evidence_date')::date,nullif(x->>'effective_from','')::date,x->>'strength',x->>'evidence_text',coalesce(x->'metadata','{{}}'::jsonb) from e on conflict do nothing;
with p as (select {p} v),n as (select x from p,jsonb_array_elements(v->'nodes') x)
insert into core.organization_nodes(org_node_id,org_contract_version,node_key,official_name,node_status,primary_evidence_id)
select (x->>'id')::uuid,'organization-v1',x->>'key',x->>'name',x->>'status',(x->>'evidence_id')::uuid from n on conflict do nothing;
with p as (select {p} v),a as (select x from p,jsonb_array_elements(v->'assessments') x)
insert into core.organization_label_assessments(label_id,label_contract_version,org_contract_version,mapping_outcome,org_node_id,evidence_id,unresolved_reason,observation_first_seen,observation_last_seen)
select (x->>'label_id')::uuid,'label-v1','organization-v1',x->>'outcome',nullif(x->>'node_id','')::uuid,nullif(x->>'evidence_id','')::uuid,x->>'reason',nullif(x->>'first','')::date,nullif(x->>'last','')::date from a on conflict do nothing;
with p as (select {p} v),r as (select x from p,jsonb_array_elements(v->'relations') x)
insert into core.organization_label_node_relations(label_node_relation_id,label_id,label_contract_version,org_node_id,org_contract_version,relation_type,time_basis,observed_from,observed_to,evidence_id,relation_status)
select (x->>'id')::uuid,(x->>'label_id')::uuid,'label-v1',(x->>'node_id')::uuid,'organization-v1','AS_OF',x->>'basis',nullif(x->>'first','')::date,nullif(x->>'last','')::date,(x->>'evidence_id')::uuid,'CONFIRMED' from r on conflict do nothing;
with p as (select {p} v),g as (select x from p,jsonb_array_elements(v->'edges') x)
insert into core.organization_lineage_edges(lineage_edge_id,org_contract_version,from_org_node_id,to_org_node_id,relation_type,effective_date,edge_scope,evidence_id,evidence_status)
select (x->>'id')::uuid,'organization-v1',(x->>'from_id')::uuid,(x->>'to_id')::uuid,x->>'relation_type',(x->>'effective_date')::date,x->>'edge_scope',(x->>'evidence_id')::uuid,'OFFICIAL_DIRECT' from g on conflict do nothing; commit;
""")


def verify(expected: dict[str, Any]) -> dict[str, Any]:
    payload=sql_json(expected)
    rows=q(f"""with p as (select {payload} v)
    select json_build_object(
      'evidence',(select count(*) from core.organization_evidence where org_contract_version='organization-v1'),
      'nodes',(select count(*) from core.organization_nodes where org_contract_version='organization-v1'),
      'assessments',(select count(*) from core.organization_label_assessments where org_contract_version='organization-v1'),
      'relations',(select count(*) from core.organization_label_node_relations where org_contract_version='organization-v1'),
      'edges',(select count(*) from core.organization_lineage_edges where org_contract_version='organization-v1'),
      'outcomes',(select json_object_agg(mapping_outcome,c) from (select mapping_outcome,count(*) c from core.organization_label_assessments where org_contract_version='organization-v1' group by mapping_outcome) s),
      'edge_types',(select json_object_agg(relation_type,c) from (select relation_type,count(*) c from core.organization_lineage_edges where org_contract_version='organization-v1' group by relation_type) s),
      'broken_fk',(select count(*) from core.organization_label_node_relations r left join core.organization_nodes n on n.org_node_id=r.org_node_id where n.org_node_id is null),
      'self_loops',(select count(*) from core.organization_lineage_edges where from_org_node_id=to_org_node_id),
      'duplicate_edges',(select count(*) from (select from_org_node_id,to_org_node_id,relation_type,effective_date,edge_scope,count(*) from core.organization_lineage_edges where org_contract_version='organization-v1' group by 1,2,3,4,5 having count(*)>1) d),
      'lineage_cycles',(with recursive walk(origin,current,path,cycle) as (
        select from_org_node_id,to_org_node_id,array[from_org_node_id,to_org_node_id],from_org_node_id=to_org_node_id
        from core.organization_lineage_edges where org_contract_version='organization-v1' and relation_type in ('RENAMED_TO','SUCCEEDED_BY')
        union all
        select w.origin,e.to_org_node_id,w.path||e.to_org_node_id,e.to_org_node_id=any(w.path)
        from walk w join core.organization_lineage_edges e on e.from_org_node_id=w.current
        where e.org_contract_version='organization-v1' and e.relation_type in ('RENAMED_TO','SUCCEEDED_BY') and not w.cycle
      ) select count(*) from walk where cycle),
      'temporal_conflicts',(select count(*) from core.organization_label_node_relations r join core.organization_nodes n on n.org_node_id=r.org_node_id where (n.valid_from is not null and r.observed_from<n.valid_from) or (n.valid_to is not null and r.observed_to>n.valid_to)),
      'publish_regulations',(select count(*) from publish.regulations r join publish.current_release c using(release_id) where c.singleton_key),
      'publish_notices',(select count(*) from publish.notices n join publish.current_release c using(release_id) where c.singleton_key),
      'notice_links',(select sum(cardinality(linked_regulation_version_ids)) from publish.notices n join publish.current_release c using(release_id) where c.singleton_key),
      'residuals',(select count(*) from publish.notice_department_residual_occurrences r join publish.current_release c using(release_id) where c.singleton_key),
      'attachments',(select count(*) from core.source_attachments), 'observations',(select count(*) from core.source_attachment_observations),
      'parser_runs',(select count(*) from core.parser_runs), 'extractions',(select count(*) from core.document_extractions),
      'mentions',(select count(*) from core.extraction_mentions), 'labels',(select count(*) from core.labels where label_contract_version='label-v1'),
      'evidence_exact',(select count(*) from p,jsonb_array_elements(v->'evidence') x join core.organization_evidence e on e.organization_evidence_id=(x->>'id')::uuid and e.evidence_key=x->>'key' and e.source_kind=x->>'kind' and e.source_reference=x->>'source_reference' and e.observed_name=x->>'observed_name' and e.evidence_date=(x->>'evidence_date')::date),
      'nodes_exact',(select count(*) from p,jsonb_array_elements(v->'nodes') x join core.organization_nodes n on n.org_node_id=(x->>'id')::uuid and n.official_name=x->>'name' and n.node_status=x->>'status' and n.primary_evidence_id=(x->>'evidence_id')::uuid),
      'assessments_exact',(select count(*) from p,jsonb_array_elements(v->'assessments') x join core.organization_label_assessments a on a.label_id=(x->>'label_id')::uuid and a.org_contract_version='organization-v1' and a.mapping_outcome=x->>'outcome' and a.org_node_id is not distinct from nullif(x->>'node_id','')::uuid and a.evidence_id is not distinct from nullif(x->>'evidence_id','')::uuid and a.unresolved_reason is not distinct from (x->>'reason')),
      'relations_exact',(select count(*) from p,jsonb_array_elements(v->'relations') x join core.organization_label_node_relations r on r.label_node_relation_id=(x->>'id')::uuid and r.label_id=(x->>'label_id')::uuid and r.org_node_id=(x->>'node_id')::uuid and r.evidence_id=(x->>'evidence_id')::uuid),
      'edges_exact',(select count(*) from p,jsonb_array_elements(v->'edges') x join core.organization_lineage_edges e on e.lineage_edge_id=(x->>'id')::uuid and e.from_org_node_id=(x->>'from_id')::uuid and e.to_org_node_id=(x->>'to_id')::uuid and e.relation_type=x->>'relation_type' and e.effective_date=(x->>'effective_date')::date and e.edge_scope=x->>'edge_scope')
    ) state from p;""")
    state=rows[0]["state"]
    if isinstance(state,str): state=json.loads(state)
    required={"evidence":29,"nodes":27,"assessments":40,"relations":27,"edges":2,"broken_fk":0,"self_loops":0,"duplicate_edges":0,"lineage_cycles":0,"temporal_conflicts":0,
      "publish_regulations":1041,"publish_notices":2089,"notice_links":3775,"residuals":1272,"attachments":2414,"observations":2414,"parser_runs":2414,"extractions":2397,"mentions":20937,"labels":2209,
      "evidence_exact":29,"nodes_exact":27,"assessments_exact":40,"relations_exact":27,"edges_exact":2}
    for k,v in required.items():
        if state.get(k)!=v: raise T05Error(f"verification mismatch {k}={state.get(k)} expected {v}")
    return state


def main() -> None:
    ap=argparse.ArgumentParser(); ap.add_argument("--mode",choices=["preflight","apply","verify"],default="preflight"); ap.add_argument("--summary"); args=ap.parse_args()
    data=build()
    if args.mode=="apply": apply(data)
    state=verify(data) if args.mode in ("apply","verify") else {"expected":{"evidence":len(data["evidence"]),"nodes":len(data["nodes"]),"assessments":len(data["assessments"]),"relations":len(data["relations"]),"edges":len(data["edges"])}}
    result={"org_contract_version":"organization-v1","mode":args.mode,"state":state,
      "residual_org_labels":[a for a in data["assessments"] if next(r for r in data["labels"] if r["label_id"]==a["label_id"])["department_residual_occurrence_count"]>0]}
    if args.summary:
        path = Path(args.summary)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__ == "__main__": main()
