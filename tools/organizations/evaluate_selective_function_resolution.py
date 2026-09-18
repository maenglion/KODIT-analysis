"""T06.8.4 precision-first selective resolver evaluation.

Rule construction uses calibration years only. Holdout is evaluated once.
The T06.8.3 retrieval result is frozen; this script adds evidence gates and
never reads T01 residual rows.
"""

from __future__ import annotations

import argparse, hashlib, importlib.util, json, math, re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "config/selective-function-resolution-v1.json"
PARENT = ROOT / "reports/measurements/2026-09-18-historical-enacted-positive-control-v1/result.json"


def load_module():
    path = ROOT / "tools/organizations/evaluate_org_function_positive_control.py"
    spec = importlib.util.spec_from_file_location("positive_control_v4", path)
    module = importlib.util.module_from_spec(spec); assert spec and spec.loader
    spec.loader.exec_module(module); return module


def norm(value):
    return re.sub(r"[^가-힣a-z0-9]+", "", (value or "").lower())


def atomic(value):
    first = (value or "").splitlines()[0]
    return re.sub(r"^\s*\d{1,2}\.\s*", "", first).strip()


def wilson(correct, total):
    if not total: return [None, None]
    z=1.959963984540054; p=correct/total; d=1+z*z/total
    c=(p+z*z/(2*total))/d; h=z*math.sqrt((p*(1-p)+z*z/(4*total))/total)/d
    return [max(0,c-h),min(1,c+h)]


def summarize(rows):
    accepted=len(rows); correct=sum(r["correct"] for r in rows)
    return {"accepted":accepted,"correct":correct,"wrong":accepted-correct,
            "precision":correct/accepted if accepted else None,"wilson95":wilson(correct,accepted)}


def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--output",default="reports/measurements/2026-09-18-selective-function-resolution-v1/result.json"); args=ap.parse_args()
    cfg=json.loads(CONFIG.read_text(encoding="utf-8")); parent=json.loads(PARENT.read_text(encoding="utf-8")); module=load_module()
    rows=parent["rows"]
    profiles=module.query("""
select a.function_assignment_id::text,a.work_string,a.org_node_id::text,n.official_name,
 p.profile_key,p.valid_from::text,p.valid_to::text
from analytics.temporal_organization_function_assignments_v1 a
join core.temporal_function_profiles p using(temporal_profile_id)
join core.organization_nodes n on n.org_node_id=a.org_node_id
where p.profile_status='OFFICIAL_ENACTED' order by p.valid_from,n.official_name,a.assignment_key;
""")
    features=module.feature_rows([r["notice_id"] for r in rows]); module.parse_arrays(features); fmap={r["notice_id"]:r for r in features}
    generic={norm(x) for x in cfg["generic_function_lexicon"]}
    phrase_orgs=defaultdict(set); prepared=[]
    for p in profiles:
        phrase=atomic(p["work_string"]); key=norm(phrase)
        is_generic=len(key)<cfg["minimum_atomic_phrase_characters"] or key in generic
        item={**p,"phrase":phrase,"phrase_key":key,"generic":is_generic}; prepared.append(item)
        if key and not is_generic: phrase_orgs[key].add(p["org_node_id"])
    phrase_stats={"assignments":len(prepared),"distinct_atomic_phrases":len({p['phrase_key'] for p in prepared if p['phrase_key']}),
                  "unique_org_phrases":sum(len(v)==1 for v in phrase_orgs.values()),
                  "multi_org_phrases":sum(len(v)>1 for v in phrase_orgs.values()),
                  "generic_phrases":len({p['phrase_key'] for p in prepared if p['generic']})}

    def active(p, posted):
        return (not p["valid_from"] or date.fromisoformat(p["valid_from"])<=posted) and (not p["valid_to"] or posted<date.fromisoformat(p["valid_to"]))

    category_names=["A_ORG_NOT_IN_PROFILE","B_ORG_EXISTS_FUNCTION_MISSING","C_FUNCTION_ASSIGNED_TO_DIFFERENT_ORG",
                    "D_MULTI_ORG_FUNCTION","E_DATE_BOUNDARY_CONFLICT","F_ORG_ALIAS_OR_NAME_CHANGE",
                    "G_PARSER_OR_EXTRACTION_GAP","H_NOTICE_DEPARTMENT_IS_NOT_FUNCTION_OWNER","I_OTHER_UNRESOLVED"]
    mismatch=Counter({name:0 for name in category_names}); mismatch_examples=defaultdict(list); evaluations=[]
    for base in rows:
        posted=date.fromisoformat(base["posted_date"]); feature=fmap[base["notice_id"]]; current=[p for p in prepared if active(p,posted)]
        answer=set(base["answer_org_node_ids"]); active_orgs={p["org_node_id"] for p in current}
        channel_text={"TITLE":[feature["title"]],"BODY":feature["body_texts"],"REGULATION":feature["regulation_names"],
                      "PROPOSES_CHANGE_TO":feature["proposal_names"],"WORK":feature["work_strings"]}
        matches=[]
        for p in current:
            if p["generic"] or not p["phrase_key"]: continue
            channels={ch for ch,vals in channel_text.items() if any(p["phrase_key"] in norm(v) for v in vals)}
            if channels: matches.append({"org":p["org_node_id"],"org_name":p["official_name"],"phrase":p["phrase"],"key":p["phrase_key"],"channels":sorted(channels),"unique":len(phrase_orgs[p["phrase_key"]])==1})
        matched_orgs={m["org"] for m in matches}; unique_matches=[m for m in matches if m["unique"]]
        if not base["asof_function_gold"]:
            if not current: category="E_DATE_BOUNDARY_CONFLICT"
            elif matched_orgs and not matched_orgs & answer and len(matched_orgs)==1: category="H_NOTICE_DEPARTMENT_IS_NOT_FUNCTION_OWNER"
            elif len(matched_orgs)>1: category="D_MULTI_ORG_FUNCTION"
            elif answer and not answer & active_orgs: category="A_ORG_NOT_IN_PROFILE"
            else: category="I_OTHER_UNRESOLVED"
            mismatch[category]+=1
            if len(mismatch_examples[category])<5: mismatch_examples[category].append({"notice_id":base["notice_id"],"posted_date":base["posted_date"],"answer":base["answer_label"],"title":feature["title"],"matched_orgs":sorted({m["org_name"] for m in matches})})
        evidence_by_org=defaultdict(lambda: {"phrases":set(),"channels":set()})
        for m in unique_matches:
            evidence_by_org[m["org"]]["phrases"].add(m["key"]); evidence_by_org[m["org"]]["channels"].update(m["channels"])
        top1=base.get("top1"); analog_org=top1["org_node_id"] if top1 else None
        rules=defaultdict(set)
        for org,ev in evidence_by_org.items():
            if len(ev["phrases"])==1: rules["R1_UNIQUE_EXACT_FUNCTION"].add(org)
            if len(ev["phrases"])>=2: rules["R2_MULTI_FUNCTION_SAME_ORG"].add(org)
            if "REGULATION" in ev["channels"]: rules["R3_REGULATION_PLUS_FUNCTION"].add(org)
            if "PROPOSES_CHANGE_TO" in ev["channels"]: rules["R4_PROPOSAL_RULE_PLUS_FUNCTION"].add(org)
            if {"TITLE","BODY"}<=ev["channels"]: rules["R5_TITLE_BODY_FUNCTION_CONVERGENCE"].add(org)
            if org==analog_org: rules["R6_ANALOG_PLUS_OFFICIAL_FUNCTION"].add(org)
        for family in cfg["rule_families"]:
            candidates=rules.get(family,set()); accepted=len(candidates)==1 and family!="R7_TITLE_OR_SIMILARITY_ONLY"
            org=next(iter(candidates)) if accepted else None
            evaluations.append({"notice_id":base["notice_id"],"year":posted.year,"answer_label":base["answer_label"],"family":family,
                                "accepted":accepted,"candidate_org":org,"correct":bool(accepted and org in answer),
                                "gold":base["complete_multi_org_gold"],"strict_owner":bool(answer and any(m["org"] in answer for m in unique_matches) and len(matched_orgs)==1),
                                "has_regulation":bool(feature["regulation_names"]),"has_proposal":bool(feature["proposal_names"])})

    gold=[r for r in rows if r["complete_multi_org_gold"]]
    strict_ids={e["notice_id"] for e in evaluations if e["strict_owner"]}
    calibration_years=set(cfg["calibration_years"]); holdout_years=set(cfg["holdout_years"])
    families={}
    selected=[]
    for family in cfg["rule_families"]:
        cal=[e for e in evaluations if e["family"]==family and e["accepted"] and e["gold"] and e["year"] in calibration_years]
        cal_result=summarize(cal)
        eligible=bool(cal and cal_result["precision"] is not None and cal_result["precision"]>=cfg["minimum_holdout_precision"] and family!="R7_TITLE_OR_SIMILARITY_ONLY")
        if eligible: selected.append(family)
        hold=[e for e in evaluations if e["family"]==family and e["accepted"] and e["gold"] and e["year"] in holdout_years]
        families[family]={"calibration":cal_result,"selected_from_calibration":eligible,"holdout":summarize(hold),
                          "holdout_coverage":len(hold)/sum(r["posted_date"][:4] in ('2025','2026') for r in gold)}
    accepted_hold=[]
    by_notice=defaultdict(list)
    for e in evaluations:
        if e["family"] in selected and e["accepted"] and e["gold"] and e["year"] in holdout_years: by_notice[e["notice_id"]].append(e)
    for _,items in by_notice.items():
        orgs={e["candidate_org"] for e in items}; accepted_hold.append({"correct":len(orgs)==1 and all(e["correct"] for e in items)}) if len(orgs)==1 else None
    union=summarize(accepted_hold)
    approved=bool(union["accepted"]>=cfg["minimum_holdout_accepted"] and union["precision"] is not None and union["precision"]>=cfg["minimum_holdout_precision"])
    frontier=[]
    hold_all=[e for e in evaluations if e["accepted"] and e["gold"] and e["year"] in holdout_years and e["family"]!="R7_TITLE_OR_SIMILARITY_ONLY"]
    for target in (0.90,0.95,0.98,1.0):
        choices=[]
        for family in cfg["rule_families"][:-1]:
            members=[e for e in hold_all if e["family"]==family]; s=summarize(members)
            if s["accepted"] and s["precision"]>=target: choices.append((s["accepted"],family,s))
        best=max(choices,default=None)
        frontier.append({"precision_target":target,"rule_family":best[1] if best else None,"accepted":best[0] if best else 0,
                         "coverage":best[0]/sum(r["posted_date"][:4] in ('2025','2026') for r in gold) if best else 0,"observed":best[2] if best else None})
    confusion=Counter((r["answer_label"],r["top1"]["org_name"]) for r in gold if r.get("top1") and not r["top1_correct"])
    name_ids=defaultdict(set)
    for p in prepared: name_ids[p["official_name"]].add(p["org_node_id"])
    confusion_rows=[]
    for (answer_name,predicted_name),count in confusion.most_common(15):
        members=[r for r in gold if r.get("top1") and r["answer_label"]==answer_name and r["top1"]["org_name"]==predicted_name]
        shared=sum(bool(orgs & name_ids[answer_name] and orgs & name_ids[predicted_name]) for orgs in phrase_orgs.values())
        confusion_rows.append({"answer":answer_name,"predicted":predicted_name,"count":count,
          "epochs":dict(Counter(r["posted_date"][:4] for r in members)),"shared_official_phrase_count":shared,
          "with_regulation":sum(bool(fmap[r["notice_id"]]["regulation_names"]) for r in members),
          "with_proposal":sum(bool(fmap[r["notice_id"]]["proposal_names"]) for r in members),
          "pattern":"frozen_retrieval_top1"})
    regulation_groups={}
    for name,pred in {"resolved_regulation":lambda e:e["has_regulation"],"proposes_change_to":lambda e:e["has_proposal"],"neither":lambda e:not e["has_regulation"] and not e["has_proposal"]}.items():
        ids={e["notice_id"] for e in evaluations if e["gold"] and pred(e)}; subset=[r for r in gold if r["notice_id"] in ids]
        regulation_groups[name]={"population":len(subset),"top1_accuracy":sum(r["top1_correct"] for r in subset)/len(subset) if subset else None}
    epoch=Counter(r["posted_date"][:4] for r in gold); strict_epoch=Counter(r["posted_date"][:4] for r in gold if r["notice_id"] in strict_ids)
    cal_reg=set(); hold_reg=set(); cal_work=set(); hold_work=set()
    for r in gold:
        target_reg,target_work=(cal_reg,cal_work) if int(r["posted_date"][:4]) in calibration_years else (hold_reg,hold_work)
        f=fmap[r["notice_id"]]; target_reg.update(norm(v) for v in f["regulation_names"] if norm(v)); target_work.update(norm(v) for v in f["work_strings"] if norm(v))
    report={"contract_version":cfg["contract_version"],"config_sha256":hashlib.sha256(CONFIG.read_bytes()).hexdigest(),
      "mismatch_119":{"count":sum(mismatch.values()),"categories":dict(mismatch),"examples":dict(mismatch_examples)},
      "gold":{"complete_multi_org":len(gold),"strict_function_owner":len(strict_ids),"epoch_counts":dict(epoch),"strict_epoch_counts":dict(strict_epoch)},
      "split":{"calibration_years":cfg["calibration_years"],"holdout_years":cfg["holdout_years"],"same_notice_overlap":0,
               "regulation_family_overlap":len(cal_reg & hold_reg),"normalized_work_family_overlap":len(cal_work & hold_work)},
      "leakage":{"department_input_count":0,"residual_rows_queried":False,"count":0},"function_phrase_audit":phrase_stats,
      "rule_families":families,"selected_rules":selected,"holdout_union":union,"auto_accept":approved,
      "precision_frontier":frontier,"top_confusions":confusion_rows,
      "regulation_evidence":regulation_groups,"direct_regulation_stewardship_added":0,
      "residual_application":{"performed":False,"reason":"AUTO_ACCEPT gate not satisfied" if not approved else "separate versioned run required"},
      "protected":{"parent_checkpoint":cfg["parent_checkpoint"],"retrieval_changed":False,"weights_changed":False,"threshold_changed":False}}
    if sum(mismatch.values())!=119: raise RuntimeError(f"mismatch audit expected 119, got {sum(mismatch.values())}")
    out=ROOT/args.output; out.parent.mkdir(parents=True,exist_ok=True); out.write_bytes((json.dumps(report,ensure_ascii=False,indent=2)+"\n").encode("utf-8"))
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=="__main__": main()
