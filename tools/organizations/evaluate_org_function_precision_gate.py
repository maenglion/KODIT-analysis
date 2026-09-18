"""T06.8.1 temporal gold separation and precision-gated resolver evaluation.

The program consumes the frozen v4 predictions, queries only positive-control
temporal evidence, chooses rules on CALIBRATION, and opens HOLDOUT once for
measurement. It never queries the department residual ledger.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "config" / "org-function-precision-gate-v1.json"
PARENT = ROOT / "reports" / "measurements" / "2026-09-18-org-function-positive-control-v4" / "result.json"


def load_v4_module():
    path = ROOT / "tools" / "organizations" / "evaluate_org_function_positive_control.py"
    spec = importlib.util.spec_from_file_location("positive_control_v4", path)
    if not spec or not spec.loader:
        raise RuntimeError("cannot load frozen v4 evaluator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def temporal_rows(query) -> list[dict[str, Any]]:
    return query("""
with current_release as (select release_id from publish.current_release where singleton_key),
positive as (
  select n.notice_id,n.posted_date,btrim(n.notice_department) answer_label,
    array_remove(array_agg(distinct o.org_node_id::text),null) answer_org_node_ids
  from current_release c join publish.notices n using(release_id)
  left join core.organization_nodes o
    on o.org_contract_version in ('organization-v1','organization-v1-evidence-r2')
   and o.official_name=btrim(n.notice_department)
  where publish.is_v06_canonical_notice_department(n.notice_department)
  group by n.notice_id,n.posted_date,btrim(n.notice_department)
)
select p.notice_id::text,p.posted_date::text,p.answer_label,to_json(p.answer_org_node_ids) answer_org_node_ids,
  exists(select 1 from analytics.canonical_organization_function_assignments a
    where a.org_node_id::text=any(p.answer_org_node_ids)
      and a.assignment_contract_version='org-function-assignment-v2'
      and p.posted_date>=coalesce(a.valid_from,'-infinity'::date)
      and p.posted_date<coalesce(a.valid_to,'infinity'::date)) current_window_compatible,
  exists(select 1 from analytics.canonical_organization_function_assignments a
    where a.org_node_id::text=any(p.answer_org_node_ids)
      and a.assignment_contract_version='org-function-assignment-v3'
      and p.posted_date>=coalesce(a.valid_from,'-infinity'::date)
      and p.posted_date<coalesce(a.valid_to,'infinity'::date)) historical_assignment_supported,
  exists(select 1 from core.organization_snapshots s
    join core.organization_snapshot_observations so using(snapshot_id)
    where so.org_node_id::text=any(p.answer_org_node_ids)
      and p.posted_date>=coalesce(s.effective_date,s.snapshot_date)
      and p.posted_date<coalesce((select min(coalesce(s2.effective_date,s2.snapshot_date))
        from core.organization_snapshots s2
        where coalesce(s2.effective_date,s2.snapshot_date)>coalesce(s.effective_date,s.snapshot_date)),'infinity'::date)
  ) snapshot_epoch_supported,
  exists(select 1 from analytics.canonical_organization_function_assignments a
    where a.org_node_id::text=any(p.answer_org_node_ids)
      and a.assignment_contract_version='org-function-assignment-v2') has_current_assignment
from positive p order by p.notice_id;
""")


def decode_arrays(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        if isinstance(row.get("answer_org_node_ids"), str):
            row["answer_org_node_ids"] = json.loads(row["answer_org_node_ids"])


def split_rows(rows: list[dict[str, Any]], fraction: float, version: str) -> None:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[row["answer_label"]].append(row)
    for label_rows in groups.values():
        label_rows.sort(key=lambda row: hashlib.sha256(f"{version}:{row['notice_id']}".encode()).hexdigest())
        holdout = 0 if len(label_rows) < 2 else max(1, round(len(label_rows) * fraction))
        for index, row in enumerate(label_rows):
            row["split"] = "HOLDOUT" if index < holdout else "CALIBRATION"


def rule_pass(row: dict[str, Any], family: str, score: float, margin: float) -> bool:
    if not row.get("top3") or row["top1_top2_margin"] < margin:
        return False
    channels = row["top3"][0]["channel_scores"]
    audit = row["feature_audit"]
    if family == "DUAL_REGULATION_SIGNAL":
        return audit["has_regulation"] and audit["has_proposal"] and min(channels["regulation"], channels["proposal"]) >= score
    if family == "EXACT_ATOMIC_SIGNAL":
        return max(channels.values()) >= max(score, 0.999)
    if family == "REGULATION_TITLE_CORROBORATED":
        corroboration = max(channels["body"], channels["proposal"], channels["work"])
        return audit["has_regulation"] and min(channels["title"], channels["regulation"], corroboration) >= score
    if family == "TITLE_BODY_WITHOUT_REGULATION":
        return not audit["has_regulation"] and not audit["has_proposal"] and audit["has_body"] and min(channels["title"], channels["body"]) >= score
    raise ValueError(f"unknown family {family}")


def correct(row: dict[str, Any]) -> bool:
    return bool(row.get("top3")) and row["top3"][0]["org_node_id"] in row["answer_org_node_ids"]


def compact_ngrams(value: str, size: int = 2) -> Counter[str]:
    compact = "".join(ch for ch in value if ch.isalnum())
    return Counter(compact[index:index + size] for index in range(max(0, len(compact) - size + 1)))


def select_family(rows: list[dict[str, Any]], family: str, target: float, config: dict[str, Any]) -> dict[str, Any] | None:
    candidates = []
    for score in config["calibration"]["score_grid"]:
        for margin in config["calibration"]["margin_grid"]:
            accepted = [row for row in rows if rule_pass(row, family, score, margin)]
            if len(accepted) < config["calibration"]["minimum_family_accepted"]:
                continue
            hits = sum(correct(row) for row in accepted)
            precision = hits / len(accepted)
            if precision >= target:
                candidates.append((len(accepted), precision, -score, -margin, score, margin, hits))
    if not candidates:
        return None
    accepted_count, precision, _, _, score, margin, hits = max(candidates)
    return {"family": family, "score_threshold": score, "margin_threshold": margin,
            "calibration_accepted": accepted_count, "calibration_correct": hits,
            "calibration_precision": precision}


def evaluate_policy(rows: list[dict[str, Any]], rules: list[dict[str, Any]]) -> dict[str, Any]:
    accepted = []
    family_counts = Counter()
    for row in rows:
        matched = [rule["family"] for rule in rules if rule_pass(row, rule["family"], rule["score_threshold"], rule["margin_threshold"])]
        if matched:
            accepted.append(row)
            family_counts.update(matched)
    hits = sum(correct(row) for row in accepted)
    return {"population": len(rows), "accepted": len(accepted), "correct": hits,
            "precision": hits / len(accepted) if accepted else None,
            "coverage": len(accepted) / len(rows) if rows else 0.0,
            "family_match_counts": dict(sorted(family_counts.items()))}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="reports/measurements/2026-09-18-org-function-precision-gate-v1/result.json")
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    parent = json.loads(PARENT.read_text(encoding="utf-8"))
    if parent["contract_version"] != config["parent_measurement"]:
        raise RuntimeError("parent measurement contract mismatch")
    module = load_v4_module()
    temporal = temporal_rows(module.query)
    decode_arrays(temporal)
    if len(temporal) != 817:
        raise RuntimeError(f"expected 817 temporal rows, got {len(temporal)}")
    by_id = {row["notice_id"]: row for row in temporal}
    rows = []
    for source in parent["rows"]:
        row = dict(source)
        row.update(by_id[row["notice_id"]])
        historical = row["historical_assignment_supported"] or row["snapshot_epoch_supported"]
        if row["current_window_compatible"]:
            row["gold_semantics"] = "CURRENT_FUNCTION_GOLD"
        elif historical:
            row["gold_semantics"] = "HISTORICAL_ASOF_GOLD"
        else:
            row["gold_semantics"] = "OBSERVED_DEPARTMENT_ONLY"
        if row["current_window_compatible"]:
            row["temporal_class"] = "CURRENT_WINDOW_COMPATIBLE"
        elif historical:
            row["temporal_class"] = "HISTORICAL_WINDOW_SUPPORTED"
        elif row["has_current_assignment"]:
            row["temporal_class"] = "TEMPORAL_CONFLICT"
        else:
            row["temporal_class"] = "NEITHER"
        rows.append(row)

    strict = [row for row in rows if row["strict_subset"]]
    current_gold = [row for row in strict if row["gold_semantics"] == "CURRENT_FUNCTION_GOLD"]
    split_rows(current_gold, config["split"]["holdout_fraction"], config["split"]["version"])
    calibration = [row for row in current_gold if row["split"] == "CALIBRATION"]
    holdout = [row for row in current_gold if row["split"] == "HOLDOUT"]

    policy_results = []
    for target in config["calibration"]["precision_targets"]:
        rules = [selected for family in config["rule_families"]
                 if (selected := select_family(calibration, family, target, config))]
        policy_results.append({"precision_target": target, "selected_rules": rules,
                               "calibration": evaluate_policy(calibration, rules),
                               "holdout": evaluate_policy(holdout, rules)})
    primary = next(item for item in policy_results if item["precision_target"] == config["auto_accept_precision"])
    auto_accept = (primary["holdout"]["accepted"] >= config["calibration"]["minimum_holdout_accepted_for_auto_accept"]
                   and primary["holdout"]["precision"] is not None
                   and primary["holdout"]["precision"] >= config["auto_accept_precision"])

    assignments = module.assignment_rows()
    atomic_profiles, _ = module.numbered_detailed_assignments(assignments)
    profiles_by_org: dict[str, list[str]] = defaultdict(list)
    for profile in atomic_profiles:
        profiles_by_org[profile["org_node_id"]].append(profile["work_string"])
    pairs = Counter()
    pair_rows: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in strict:
        if row["ambiguous"] and row["top3"] and not correct(row):
            pair = (row["answer_label"], row["top3"][0]["org_name"])
            pairs[pair] += 1
            pair_rows[pair].append(row)
    org_name_to_id = {row["official_name"]: row["org_node_id"] for row in assignments}
    pair_analysis = []
    for pair, count in pairs.most_common(20):
        actual_id, predicted_id = org_name_to_id.get(pair[0]), org_name_to_id.get(pair[1])
        left = sum((compact_ngrams(text) for text in profiles_by_org.get(actual_id, [])), Counter())
        right = sum((compact_ngrams(text) for text in profiles_by_org.get(predicted_id, [])), Counter())
        shared = sorted(left.keys() & right.keys(), key=lambda key: (-(left[key] + right[key]), key))[:12]
        examples = pair_rows[pair]
        pair_analysis.append({
            "actual_org": pair[0], "predicted_org": pair[1], "count": count,
            "shared_function_bigrams": shared,
            "evidence_presence": {
                "regulation": sum(row["feature_audit"]["has_regulation"] for row in examples),
                "proposal": sum(row["feature_audit"]["has_proposal"] for row in examples),
                "body": sum(row["feature_audit"]["has_body"] for row in examples),
                "work": sum(row["feature_audit"]["has_work"] for row in examples),
            },
            "mean_top1_channel_scores": {channel: sum(row["top3"][0]["channel_scores"][channel] for row in examples) / count
                                         for channel in ("title", "body", "regulation", "proposal", "work")},
        })
    coarse_nodes = {item["org_node_id"] for item in parent["phrase_grain_audit"]["coarse_assignments"]}
    coarse_rows = [row for row in strict if set(row["answer_org_node_ids"]) & coarse_nodes]
    noncoarse_rows = [row for row in strict if not set(row["answer_org_node_ids"]) & coarse_nodes]
    regulation_rows = [row for row in strict if row["feature_audit"]["has_regulation"] or row["feature_audit"]["has_proposal"]]

    temporal_counts = Counter(row["temporal_class"] for row in strict)
    gold_counts = Counter(row["gold_semantics"] for row in strict)
    temporal_summary = {key: temporal_counts.get(key, 0) for key in (
        "CURRENT_WINDOW_COMPATIBLE", "HISTORICAL_WINDOW_SUPPORTED", "NEITHER", "TEMPORAL_CONFLICT"
    )}
    current_confusion = Counter(
        (row["answer_label"], row["top3"][0]["org_name"] if row["top3"] else "NO_CANDIDATE")
        for row in current_gold
    )
    report = {
        "contract_version": config["contract_version"],
        "parent_measurement": config["parent_measurement"],
        "config_sha256": hashlib.sha256(CONFIG.read_bytes()).hexdigest(),
        "population": {"known_answer": len(rows), "strict_subset": len(strict)},
        "gold_semantics": dict(sorted(gold_counts.items())),
        "temporal_reclassification": temporal_summary,
        "temporal_overlap_audit": {
            "current_and_historical_supported": sum(row["current_window_compatible"] and (row["historical_assignment_supported"] or row["snapshot_epoch_supported"]) for row in strict),
            "historical_supported_total_before_exclusive_precedence": sum(row["historical_assignment_supported"] or row["snapshot_epoch_supported"] for row in strict),
            "current_assignment_2026_applied_to_pre_2026_notice": sum(row["has_current_assignment"] and row["posted_date"] < "2026-01-01" for row in strict),
            "notice_2012_count": sum(row["posted_date"].startswith("2012-") for row in strict)
        },
        "legacy_metric_semantics": {
            "name": "2026_PROFILE_OBSERVED_DEPARTMENT_REPRODUCTION_DIAGNOSTIC",
            "top1_correct": parent["metrics"]["top1_correct"],
            "denominator": parent["population"]["strict_subset"],
            "rate": parent["metrics"]["top1_accuracy"],
            "not_current_function_accuracy": True
        },
        "split": {"contract": config["split"], "calibration": len(calibration), "holdout": len(holdout),
                  "overlap": len({r['notice_id'] for r in calibration} & {r['notice_id'] for r in holdout}),
                  "calibration_by_org": dict(sorted(Counter(r["answer_label"] for r in calibration).items())),
                  "holdout_by_org": dict(sorted(Counter(r["answer_label"] for r in holdout).items()))},
        "current_gold_diagnostics": {
            "population": len(current_gold),
            "coverage_count": sum(row["candidate"] for row in current_gold),
            "coverage": sum(row["candidate"] for row in current_gold) / len(current_gold) if current_gold else 0.0,
            "top1_correct": sum(correct(row) for row in current_gold),
            "top1_accuracy": sum(correct(row) for row in current_gold) / len(current_gold) if current_gold else 0.0,
            "top3_correct": sum(any(item["org_node_id"] in row["answer_org_node_ids"] for item in row["top3"]) for row in current_gold),
            "top3_recall": sum(any(item["org_node_id"] in row["answer_org_node_ids"] for item in row["top3"]) for row in current_gold) / len(current_gold) if current_gold else 0.0,
            "ambiguous": sum(row["ambiguous"] for row in current_gold),
            "no_candidate": sum(not row["candidate"] for row in current_gold),
            "confusion_matrix": [{"actual_org": pair[0], "predicted_org": pair[1], "count": count}
                                 for pair, count in sorted(current_confusion.items(), key=lambda item: (item[0][0], -item[1], item[0][1]))]
        },
        "policy_results": policy_results,
        "auto_accept": {"authorized": auto_accept,
                        "reason": "HOLDOUT_PRECISION_AND_MINIMUM_ACCEPTED_MET" if auto_accept else "HOLDOUT_GATE_NOT_MET",
                        "residual_run_created": False},
        "ambiguous_analysis": {
            "total_ambiguous": sum(row["ambiguous"] for row in strict),
            "ambiguous_top1_correct": sum(row["ambiguous"] and correct(row) for row in strict),
            "ambiguous_top1_incorrect": sum(row["ambiguous"] and not correct(row) for row in strict),
            "confusion_pairs": pair_analysis,
            "interpretation": "Shared bigrams are descriptive overlap only; they are not attribution evidence."
        },
        "coarse_assignment_impact": {
            "canonical_coarse_assignments": parent["phrase_grain_audit"]["coarse_assignment_count"],
            "coarse_rows": len(coarse_rows), "coarse_top1": sum(correct(r) for r in coarse_rows),
            "coarse_top1_rate": sum(correct(r) for r in coarse_rows) / len(coarse_rows) if coarse_rows else None,
            "noncoarse_rows": len(noncoarse_rows), "noncoarse_top1": sum(correct(r) for r in noncoarse_rows),
            "noncoarse_top1_rate": sum(correct(r) for r in noncoarse_rows) / len(noncoarse_rows) if noncoarse_rows else None,
            "canonical_rows_modified": False
        },
        "regulation_backed_subset": {
            "count": len(regulation_rows), "top1_correct": sum(correct(r) for r in regulation_rows),
            "top1_rate": sum(correct(r) for r in regulation_rows) / len(regulation_rows) if regulation_rows else None,
            "top3_correct": sum(any(c["org_node_id"] in r["answer_org_node_ids"] for c in r["top3"]) for r in regulation_rows),
            "official_regulation_to_function_relation_exists": False,
            "relation_decision": "No relation created: the current ledger has lexical regulation/proposal evidence but no official regulation-to-function assignment evidence."
        },
        "leakage": {"parent_leakage_count": parent["leakage"]["leakage_count"],
                    "residual_rows_queried": False, "holdout_used_for_rule_selection": False,
                    "leakage_count": 0},
        "current_gold_rows": [{"notice_id": r["notice_id"], "posted_date": r["posted_date"],
                               "answer_label": r["answer_label"], "split": r["split"],
                               "top1_org": r["top3"][0]["org_name"] if r["top3"] else None,
                               "top1_correct": correct(r)} for r in current_gold]
    }
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes((json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    summary = {key: report[key] for key in ("contract_version", "population", "gold_semantics", "temporal_reclassification", "temporal_overlap_audit", "legacy_metric_semantics", "split", "current_gold_diagnostics", "policy_results", "auto_accept", "ambiguous_analysis", "coarse_assignment_impact", "regulation_backed_subset", "leakage")}
    (output.parent / "summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
