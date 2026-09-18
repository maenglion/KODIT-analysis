"""T06.8.3 as-of positive control using only official enacted profiles.

The frozen T06.8.2 scorer/config is reused unchanged.  Department labels and
department-derived values are answer-only and are scrubbed from every feature.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "config" / "temporal-function-profile-v1.json"
PARENT = ROOT / "reports" / "measurements" / "2026-09-18-temporal-function-profile-v1" / "result.json"


def load_module():
    path = ROOT / "tools" / "organizations" / "evaluate_org_function_positive_control.py"
    spec = importlib.util.spec_from_file_location("positive_control_v4", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def parse_date(value, fallback):
    return date.fromisoformat(value) if value else fallback


def active(row, posted):
    return parse_date(row.get("valid_from"), date.min) <= posted < parse_date(row.get("valid_to"), date.max)


def metrics(rows):
    covered = [row for row in rows if row["candidate"]]
    return {
        "population": len(rows),
        "coverage_count": len(covered),
        "coverage": len(covered) / len(rows) if rows else 0.0,
        "top1_correct": sum(row["top1_correct"] for row in rows),
        "top1_accuracy": sum(row["top1_correct"] for row in rows) / len(rows) if rows else 0.0,
        "top3_correct": sum(row["top3_correct"] for row in rows),
        "top3_recall": sum(row["top3_correct"] for row in rows) / len(rows) if rows else 0.0,
        "ambiguous": sum(row["ambiguous"] for row in rows),
        "no_match": sum(not row["candidate"] for row in rows),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="reports/measurements/2026-09-18-historical-enacted-positive-control-v1/result.json")
    args = parser.parse_args()
    module = load_module()
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    parent = json.loads(PARENT.read_text(encoding="utf-8"))
    answers = module.query("""
with cr as (select release_id from publish.current_release where singleton_key)
select n.notice_id::text,n.posted_date::text,btrim(n.notice_department) answer_label,
 to_json(array_remove(array_agg(distinct o.org_node_id::text),null)) answer_org_node_ids
from cr join publish.notices n using(release_id)
left join core.organization_nodes o on o.org_contract_version in ('organization-v1','organization-v1-evidence-r2')
 and o.official_name=btrim(n.notice_department)
where publish.is_v06_canonical_notice_department(n.notice_department)
group by n.notice_id,n.posted_date,btrim(n.notice_department) order by n.notice_id;
""")
    module.parse_arrays(answers)
    profiles = module.query("""
select a.function_assignment_id::text,a.work_string,a.org_node_id::text,n.official_name,
 p.profile_key,p.valid_from::text,p.valid_to::text
from analytics.temporal_organization_function_assignments_v1 a
join core.temporal_function_profiles p using(temporal_profile_id)
join core.organization_nodes n on n.org_node_id=a.org_node_id
where p.profile_status='OFFICIAL_ENACTED'
order by p.valid_from,n.official_name,a.assignment_key;
""")
    features = module.feature_rows([row["notice_id"] for row in answers])
    module.parse_arrays(features)
    feature_by_id = {row["notice_id"]: row for row in features}
    known_names = {row["official_name"] for row in profiles} | {row["answer_label"] for row in answers}
    weights, sizes = config["channel_weights"], config["character_ngram_sizes"]
    for profile in profiles:
        profile["_grams"] = module.ngrams(module.scrub(profile["work_string"], known_names), sizes)
    results, leaked = [], []
    for answer in answers:
        posted = date.fromisoformat(answer["posted_date"])
        current = [row for row in profiles if active(row, posted)]
        by_org = defaultdict(list)
        for row in current:
            by_org[row["org_node_id"]].append(row)
        feature = feature_by_id[answer["notice_id"]]
        removals = known_names | set(feature["redactions"])
        values = {
            "title": [module.scrub(feature["title"], removals)],
            "body": [module.scrub(part, removals) for text in feature["body_texts"] for part in module.chunks(text)],
            "regulation": [module.scrub(v, removals) for v in feature["regulation_names"]],
            "proposal": [module.scrub(v, removals) for v in feature["proposal_names"]],
            "work": [module.scrub(v, removals) for v in feature["work_strings"]],
        }
        for name in known_names:
            needle = module.normalized(name).replace(" ", "")
            if needle and any(needle in value.replace(" ", "") for channel in values.values() for value in channel):
                leaked.append(answer["notice_id"])
        vectors = {key: [module.ngrams(v, sizes) for v in vals if v] for key, vals in values.items()}
        scored = []
        for org_id, rows in by_org.items():
            channel_scores = {channel: max((module.cosine(vec, r["_grams"])
                                           for vec in vecs for r in rows), default=0.0)
                              for channel, vecs in vectors.items()}
            score = sum(weights[channel] * channel_scores[channel] for channel in weights)
            scored.append({"org_node_id": org_id, "org_name": rows[0]["official_name"], "score": round(score, 8)})
        scored.sort(key=lambda row: (-row["score"], row["org_name"], row["org_node_id"]))
        top1 = scored[0] if scored else None
        margin = top1["score"] - scored[1]["score"] if len(scored) > 1 else (top1["score"] if top1 else 0.0)
        candidate = bool(top1 and top1["score"] >= config["minimum_candidate_score"])
        ambiguous = bool(candidate and len(scored) > 1 and margin < config["ambiguity_margin"])
        answer_ids = answer["answer_org_node_ids"]
        eligible = any(org_id in by_org for org_id in answer_ids)
        results.append({
            "notice_id": answer["notice_id"], "posted_date": answer["posted_date"], "answer_label": answer["answer_label"],
            "answer_org_node_ids": answer_ids, "active_profile_count": len({r["profile_key"] for r in current}),
            "active_org_count": len(by_org), "asof_function_gold": eligible,
            "complete_multi_org_gold": eligible and len(by_org) > 1, "candidate": candidate,
            "ambiguous": ambiguous, "margin": round(margin, 8), "top1": top1, "top3": scored[:3],
            "top1_correct": bool(top1 and top1["org_node_id"] in answer_ids),
            "top3_correct": any(row["org_node_id"] in answer_ids for row in scored[:3]),
        })
    if leaked:
        raise RuntimeError(f"organization leakage remains: {leaked[:5]}")
    gold = [row for row in results if row["asof_function_gold"]]
    complete = [row for row in results if row["complete_multi_org_gold"]]
    no_profile = [row for row in results if not row["asof_function_gold"]]
    by_year = {str(year): {"notice_count": sum(r["posted_date"].startswith(str(year)) for r in results),
                           "function_gold": sum(r["posted_date"].startswith(str(year)) for r in gold),
                           "complete_multi_org_gold": sum(r["posted_date"].startswith(str(year)) for r in complete)}
               for year in range(2022, 2027)}
    before = {"asof_department_gold": 23, "asof_function_gold": 45,
              "complete_multi_org_gold": 27, "no_matching_temporal_profile": 683}
    after = {"asof_department_gold": 23, "asof_function_gold": len(gold),
             "complete_multi_org_gold": len(complete), "no_matching_temporal_profile": len(no_profile)}
    meaningful = len(complete) > before["complete_multi_org_gold"]
    report = {
        "contract_version": "historical-enacted-positive-control-v1",
        "frozen_scorer_config_sha256": hashlib.sha256(CONFIG.read_bytes()).hexdigest(),
        "profile_assignment_count": len(profiles), "profile_epoch_count": len({r["profile_key"] for r in profiles}),
        "before": before, "after": after, "delta": {k: after[k] - before[k] for k in before},
        "coverage_2022_2026": by_year, "leakage_count": 0,
        "frozen_resolver_re_evaluated": meaningful,
        "frozen_resolver_metrics": metrics(complete) if meaningful else None,
        "algorithm_weights_threshold_changed": False, "residual_1272_applied": False,
        "rows": results,
    }
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {key: value for key, value in report.items() if key != "rows"}
    (output.parent / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
