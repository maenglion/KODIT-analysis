"""T06.8.2 as-of profile audit and leakage-free positive control.

Official preannouncements are catalogued but never promoted to enacted epochs.
Only function assignments whose valid interval overlaps the notice date enter
the candidate universe. T01 residual occurrences are not queried.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "config" / "temporal-function-profile-v1.json"
PARENT_RESULT = ROOT / "reports" / "measurements" / "2026-09-18-org-function-positive-control-v4" / "result.json"


def load_v4():
    path = ROOT / "tools" / "organizations" / "evaluate_org_function_positive_control.py"
    spec = importlib.util.spec_from_file_location("positive_control_v4", path)
    if not spec or not spec.loader:
        raise RuntimeError("cannot load v4 evaluator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def document_inventory(query) -> list[dict[str, Any]]:
    return query("""
select d.organization_evidence_document_id::text document_id,d.official_title,d.document_type,
  d.source_date::text,d.effective_date::text,d.parsed_text_available,
  coalesce((select array_agg(distinct v.version_status order by v.version_status)
    from core.organization_document_versions v
    where v.organization_evidence_document_id=d.organization_evidence_document_id),'{}'::text[]) version_statuses,
  coalesce((select array_agg(distinct s.series_code order by s.series_code)
    from core.organization_document_versions v
    join core.organization_document_version_series l using(document_version_id)
    join core.organization_document_series s using(document_series_id)
    where v.organization_evidence_document_id=d.organization_evidence_document_id),'{}'::text[]) series_codes,
  (select count(*) from core.organization_document_versions v
    where v.organization_evidence_document_id=d.organization_evidence_document_id and v.previous_version_id is not null) chained_versions,
  (select count(*) from core.organization_evidence_spans sp
    where sp.organization_evidence_document_id=d.organization_evidence_document_id and sp.observation_type='EFFECTIVE_DATE') effective_date_spans
from core.organization_evidence_documents d
where d.document_type in ('ORG_REORGANIZATION_NOTICE','ORG_RULE','ORG_FUNCTION_ASSIGNMENT',
  'ORG_DELEGATION_RULE','ORG_CHART','ORG_CONTACT_DIRECTORY')
order by d.source_date,d.official_title,d.organization_evidence_document_id;
""")


def temporal_assignments(query) -> list[dict[str, Any]]:
    return query("""
select a.function_assignment_id::text,a.assignment_contract_version,a.assignment_key,a.work_string,
  a.org_node_id::text,n.official_name,a.valid_from::text,a.valid_to::text,
  a.organization_evidence_document_id::text,d.document_type,d.official_title
from analytics.canonical_organization_function_assignments a
join core.organization_nodes n using(org_node_id)
join core.organization_evidence_documents d using(organization_evidence_document_id)
order by a.valid_from nulls first,a.valid_to nulls last,n.official_name,a.assignment_key;
""")


def positive_rows(query) -> list[dict[str, Any]]:
    return query("""
with cr as (select release_id from publish.current_release where singleton_key),
p as (
 select n.notice_id,n.posted_date,btrim(n.notice_department) answer_label,
   array_remove(array_agg(distinct o.org_node_id::text),null) answer_org_node_ids
 from cr join publish.notices n using(release_id)
 left join core.organization_nodes o
   on o.org_contract_version in ('organization-v1','organization-v1-evidence-r2')
  and o.official_name=btrim(n.notice_department)
 where publish.is_v06_canonical_notice_department(n.notice_department)
 group by n.notice_id,n.posted_date,btrim(n.notice_department)
)
select p.notice_id::text,p.posted_date::text,p.answer_label,to_json(p.answer_org_node_ids) answer_org_node_ids,
 exists(select 1 from core.organization_snapshots s join core.organization_snapshot_observations so using(snapshot_id)
   where so.org_node_id::text=any(p.answer_org_node_ids)
     and p.posted_date>=coalesce(s.effective_date,s.snapshot_date)
     and p.posted_date<coalesce((select min(coalesce(s2.effective_date,s2.snapshot_date))
       from core.organization_snapshots s2 where coalesce(s2.effective_date,s2.snapshot_date)>coalesce(s.effective_date,s.snapshot_date)),'infinity'::date)) snapshot_supported
from p order by p.notice_id;
""")


def parse_date(value: str | None, fallback: date) -> date:
    return date.fromisoformat(value) if value else fallback


def active(profile: dict[str, Any], posted: date) -> bool:
    return parse_date(profile.get("valid_from"), date.min) <= posted < parse_date(profile.get("valid_to"), date.max)


def classify_document(row: dict[str, Any]) -> str:
    statuses = row["version_statuses"]
    if isinstance(statuses, str):
        statuses = json.loads(statuses)
    if row["document_type"] == "ORG_REORGANIZATION_NOTICE" or "OFFICIAL_PREANNOUNCEMENT" in statuses:
        return "PROPOSED_AMENDMENT"
    if row["document_type"] == "ORG_CHART":
        return "ORG_CHART"
    if row["document_type"] == "ORG_FUNCTION_ASSIGNMENT":
        return "FUNCTION_ASSIGNMENT"
    if row["document_type"] == "ORG_DELEGATION_RULE":
        return "DELEGATION_RULE"
    if "CURRENT_FULLTEXT" in statuses or "HISTORICAL_FULLTEXT" in statuses:
        return "ENACTED_FULL_TEXT"
    return "UNCLASSIFIED"


def metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    top1 = sum(row["top1_correct"] for row in rows)
    top3 = sum(row["top3_correct"] for row in rows)
    covered = sum(row["candidate"] for row in rows)
    accepted = [row for row in rows if row["candidate"] and not row["ambiguous"]]
    accepted_correct = sum(row["top1_correct"] for row in accepted)
    return {
        "population": len(rows), "coverage_count": covered,
        "coverage": covered / len(rows) if rows else 0.0,
        "top1_correct": top1, "top1_accuracy": top1 / len(rows) if rows else 0.0,
        "top3_correct": top3, "top3_recall": top3 / len(rows) if rows else 0.0,
        "ambiguous": sum(row["ambiguous"] for row in rows),
        "no_match": sum(not row["candidate"] for row in rows),
        "accepted": len(accepted), "accepted_correct": accepted_correct,
        "accepted_precision": accepted_correct / len(accepted) if accepted else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="reports/measurements/2026-09-18-temporal-function-profile-v1/result.json")
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    parent = json.loads(PARENT_RESULT.read_text(encoding="utf-8"))
    strict_by_notice = {row["notice_id"]: row["strict_subset"] for row in parent["rows"]}
    module = load_v4()
    documents = document_inventory(module.query)
    assignments = temporal_assignments(module.query)
    answers = positive_rows(module.query)
    module.parse_arrays(answers)
    if len(answers) != 817 or len(assignments) != 202:
        raise RuntimeError(f"unexpected population answers={len(answers)} assignments={len(assignments)}")

    observed_classifications = Counter(classify_document(row) for row in documents)
    classifications = {key: observed_classifications.get(key, 0) for key in (
        "ENACTED_FULL_TEXT", "AMENDMENT_ENACTED", "PROPOSED_AMENDMENT", "ORG_CHART",
        "FUNCTION_ASSIGNMENT", "DELEGATION_RULE", "UNCLASSIFIED"
    )}
    historical = [row for row in documents if row["document_type"] == "ORG_REORGANIZATION_NOTICE"]
    enacted_historical = [row for row in historical if classify_document(row) in ("ENACTED_FULL_TEXT", "AMENDMENT_ENACTED")]
    proposal_with_effective = [row for row in historical if row["effective_date"] or row["effective_date_spans"]]
    version_chain_links = sum(row["chained_versions"] for row in documents)

    canonical = module.assignment_rows()
    atomic, atomic_audit = module.numbered_detailed_assignments(canonical)
    temporal_by_id = {row["function_assignment_id"]: row for row in assignments}
    profiles = []
    for row in atomic:
        item = dict(row)
        temporal = temporal_by_id.get(row["function_assignment_id"])
        if row["assignment_contract_version"] == "org-function-atomic-observation-v1":
            item.update({"valid_from": "2026-07-02", "valid_to": None, "profile_completeness": "CURRENT_MULTI_ORG"})
        elif temporal:
            item.update({"valid_from": temporal["valid_from"], "valid_to": temporal["valid_to"], "profile_completeness": "SCOPED_PRIVACY_FUNCTION_ONLY"})
        else:
            raise RuntimeError(f"temporal assignment not found for {row['function_assignment_id']}")
        profiles.append(item)

    features = module.feature_rows([row["notice_id"] for row in answers])
    module.parse_arrays(features)
    feature_by_id = {row["notice_id"]: row for row in features}
    known_org_names = {row["official_name"] for row in canonical} | {row["answer_label"] for row in answers}
    weights = config["channel_weights"]
    sizes = config["character_ngram_sizes"]
    results = []
    leaked = []
    for answer in answers:
        posted = date.fromisoformat(answer["posted_date"])
        feature = feature_by_id[answer["notice_id"]]
        removals = known_org_names | set(feature["redactions"])
        values = {
            "title": [module.scrub(feature["title"], removals)],
            "body": [module.scrub(part, removals) for text in feature["body_texts"] for part in module.chunks(text)],
            "regulation": [module.scrub(value, removals) for value in feature["regulation_names"]],
            "proposal": [module.scrub(value, removals) for value in feature["proposal_names"]],
            "work": [module.scrub(value, removals) for value in feature["work_strings"]],
        }
        for org_name in known_org_names:
            normalized = module.normalized(org_name).replace(" ", "")
            if normalized and any(normalized in value.replace(" ", "") for channel in values.values() for value in channel):
                leaked.append(answer["notice_id"])
        vectors = {channel: [module.ngrams(value, sizes) for value in channel_values if value]
                   for channel, channel_values in values.items()}
        active_profiles = [profile for profile in profiles if active(profile, posted)]
        by_org: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for profile in active_profiles:
            by_org[profile["org_node_id"]].append(profile)
        scored = []
        for org_id, org_profiles in by_org.items():
            channel_scores = {}
            for channel, value_vectors in vectors.items():
                channel_scores[channel] = max((module.cosine(value_vector, module.ngrams(module.scrub(profile["work_string"], known_org_names), sizes))
                                               for value_vector in value_vectors for profile in org_profiles), default=0.0)
            score = sum(weights[channel] * channel_scores[channel] for channel in weights)
            scored.append({"org_node_id": org_id, "org_name": org_profiles[0]["official_name"],
                           "score": round(score, 8), "channel_scores": {key: round(value, 8) for key, value in channel_scores.items()}})
        scored.sort(key=lambda item: (-item["score"], item["org_name"], item["org_node_id"]))
        top1 = scored[0] if scored else None
        top2 = scored[1] if len(scored) > 1 else None
        margin = (top1["score"] - top2["score"]) if top1 and top2 else (top1["score"] if top1 else 0.0)
        candidate = bool(top1 and top1["score"] >= config["minimum_candidate_score"])
        ambiguous = bool(candidate and top2 and margin < config["ambiguity_margin"])
        answer_nodes = answer["answer_org_node_ids"]
        eligible_answer = any(profile["org_node_id"] in answer_nodes for profile in active_profiles)
        result = {
            "notice_id": answer["notice_id"], "posted_date": answer["posted_date"],
            "answer_label": answer["answer_label"], "answer_org_node_ids": answer_nodes,
            "strict_subset": bool(strict_by_notice[answer["notice_id"]]),
            "active_profile_count": len(active_profiles), "active_org_count": len(by_org),
            "profile_completeness": "CURRENT_MULTI_ORG" if any(p["profile_completeness"] == "CURRENT_MULTI_ORG" for p in active_profiles) else "SCOPED_PRIVACY_FUNCTION_ONLY",
            "asof_department_gold": bool(answer["snapshot_supported"]),
            "asof_function_gold": eligible_answer,
            "candidate": candidate, "ambiguous": ambiguous,
            "top1": top1, "top3": scored[:3], "margin": round(margin, 8),
            "top1_correct": bool(top1 and top1["org_node_id"] in answer_nodes),
            "top3_correct": any(item["org_node_id"] in answer_nodes for item in scored[:3]),
        }
        results.append(result)
    if leaked:
        raise RuntimeError(f"organization leakage remains: {leaked[:5]}")

    function_gold = [row for row in results if row["asof_function_gold"]]
    complete_function_gold = [row for row in function_gold if row["profile_completeness"] == "CURRENT_MULTI_ORG"]
    scoped_function_gold = [row for row in function_gold if row["profile_completeness"] == "SCOPED_PRIVACY_FUNCTION_ONLY"]
    department_gold = [row for row in results if row["asof_department_gold"]]
    no_matching_profile = [row for row in results if not row["asof_function_gold"]]
    strict_no_matching_profile = [row for row in no_matching_profile if row["strict_subset"]]
    epoch_metrics = []
    epochs = [
        ("PRIVACY_RISK_MANAGEMENT", date.min, date(2024, 4, 24)),
        ("PRIVACY_RISK_COMPLIANCE", date(2024, 4, 24), date(2026, 1, 29)),
        ("PRIVACY_SAFETY_PRE_CURRENT", date(2026, 1, 29), date(2026, 7, 2)),
        ("CURRENT_MULTI_ORG", date(2026, 7, 2), date.max),
    ]
    for name, start, end in epochs:
        members = [row for row in results if start <= date.fromisoformat(row["posted_date"]) < end]
        gold = [row for row in members if row["asof_function_gold"]]
        epoch_metrics.append({"epoch": name, "valid_from": None if start == date.min else start.isoformat(),
                              "valid_to": None if end == date.max else end.isoformat(),
                              "notice_count": len(members), "function_gold_count": len(gold),
                              "candidate_universe": "MULTI_ORG" if name == "CURRENT_MULTI_ORG" else "SCOPED_SINGLE_FUNCTION_PARTIAL",
                              "metrics": metrics(gold)})

    org_metrics = []
    for label in sorted({row["answer_label"] for row in function_gold}):
        org_metrics.append({"organization": label, **metrics([row for row in function_gold if row["answer_label"] == label])})
    report = {
        "contract_version": config["contract_version"],
        "config_sha256": hashlib.sha256(CONFIG.read_bytes()).hexdigest(),
        "document_reclassification": {
            "total_catalogued": len(documents), "historical_t067_documents": len(historical),
            "classification_counts": classifications,
            "historical_enacted_fulltext": len(enacted_historical),
            "historical_proposed_amendment": sum(classify_document(row) == "PROPOSED_AMENDMENT" for row in historical),
            "proposal_with_effective_date_evidence": len(proposal_with_effective),
            "version_chain_links": version_chain_links,
            "proposal_promoted_to_enacted": 0,
        },
        "profile_contract": {
            "canonical_assignment_count": len(assignments), "atomic_profile_count": len(profiles),
            "atomic_audit": atomic_audit, "epochs": epoch_metrics,
            "historical_complete_multi_org_epoch_count": 0,
            "current_complete_multi_org_epoch_count": 1,
        },
        "positive_control": {
            "known_answer": len(results),
            "asof_department_gold": len(department_gold),
            "asof_function_gold": len(function_gold),
            "asof_function_gold_complete_multi_org": len(complete_function_gold),
            "asof_function_gold_scoped_partial": len(scoped_function_gold),
            "no_matching_answer_profile": len(no_matching_profile),
            "strict_subset": sum(row["strict_subset"] for row in results),
            "strict_no_matching_answer_profile": len(strict_no_matching_profile),
            "former_temporal_conflict_reclassified_to_no_profile": len(strict_no_matching_profile),
            "temporal_conflict_after_asof_filter": 0,
            "asof_department_metrics": metrics(department_gold),
            "asof_function_complete_universe_metrics": metrics(complete_function_gold),
            "scoped_partial_function_retrieval": {
                **metrics(scoped_function_gold),
                "multiclass_accuracy_valid": False,
                "reason": "Only the privacy-function assignee is represented in these historical epochs; rank top-1 is not a complete-universe accuracy."
            },
            "epoch_metrics": epoch_metrics,
            "organization_metrics": org_metrics,
        },
        "leakage": {"notice_department_in_feature_payload": False, "department_derived_feature_count": 0,
                    "organization_name_after_scrub_count": 0, "residual_rows_queried": False, "leakage_count": 0},
        "stewardship": {"official_regulation_function_relations_added": 0,
                        "reason": "No official regulation-to-function relation evidence exists in the held corpus."},
        "validation_gate": {
            "temporal_gold_sufficient": False,
            "calibration_holdout_performed": False,
            "auto_accept_authorized": False,
            "residual_run_created": False,
            "reason": "No historical enacted full text/version chain; historical candidate universe is a scoped privacy function only."
        },
        "rows": results,
    }
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes((json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    summary = {key: report[key] for key in ("contract_version", "document_reclassification", "profile_contract", "positive_control", "leakage", "stewardship", "validation_gate")}
    (output.parent / "summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
