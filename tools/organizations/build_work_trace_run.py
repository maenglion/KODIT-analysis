"""Plan a release-scoped, evidence-bounded work trace for department residual notices.

The planner does not classify a department label or a person. It starts from a
notice and a direct ``PROPOSES_CHANGE_TO`` assertion, then follows the separate
regulation-to-current-function relation ledger. Candidate text comparisons are
recorded as observations; they never become a confirmed owner.

The default mode is read-only and writes a checked-in JSON plan. ``--apply`` is
available only after the additive schema has been approved and applied. It uses
the existing service-role writer path and never asks for a database password.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = ROOT / "config/work-trace-run-v1.json"
DEFAULT_OUTPUT = ROOT / "reports/measurements/2026-10-03-work-trace-run-v1/result.json"
WRITE_BATCH_SIZE = 100


class WorkTraceRunError(RuntimeError):
    """A trace-plan contract or trusted-writer stop condition."""


def load_query_module():
    path = ROOT / "tools/organizations/evaluate_org_function_positive_control.py"
    spec = importlib.util.spec_from_file_location("work_trace_query", path)
    if spec is None or spec.loader is None:
        raise WorkTraceRunError("cannot load database query helper")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def stable_uuid(namespace: str, key: str) -> str:
    return str(uuid.UUID(hashlib.md5(f"kodit:{namespace}:{key}".encode("utf-8")).hexdigest()))


def stable_case_id(notice_id: str, regulation_id: str | None, work_key: str) -> str:
    regulation_key = regulation_id or "UNRESOLVED_REGULATION"
    return str(
        uuid.UUID(
            hashlib.md5(
                f"kodit:core:work-trace-case-v1:{notice_id}:{regulation_key}:{work_key}".encode("utf-8")
            ).hexdigest()
        )
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def residual_notice_rows(module) -> list[dict[str, Any]]:
    rows = module.query(
        """
with current_release as (
  select release_id from publish.current_release where singleton_key
)
select o.release_id::text,o.residual_id::text,o.notice_id::text,
  o.posted_at::text,o.title,o.source_location,
  a.assertion_id::text,a.regulation_id::text,a.change_kind,
  a.evidence_text,a.assertion_contract_version
from current_release c
join publish.notice_department_residual_occurrences o using(release_id)
left join analytics.notice_rule_change_assertions a
  on a.release_id=o.release_id and a.notice_id=o.notice_id
where o.residual_code='NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL'
order by o.notice_id,a.regulation_id;
"""
    )
    if len(rows) != 1272:
        raise WorkTraceRunError(f"current residual population {len(rows)} != 1272")
    if len({row["notice_id"] for row in rows}) != 1272:
        raise WorkTraceRunError("a residual notice has more than one direct proposal assertion")
    return rows


def notice_evidence(contract: str, row: dict[str, Any]) -> dict[str, Any]:
    key = f"notice:{row['notice_id']}"
    return {
        "evidence_reference_id": stable_uuid(f"work-trace-evidence:{contract}", key),
        "evidence_contract_version": contract,
        "evidence_key": key,
        "reference_kind": "NOTICE",
        "notice_id": row["notice_id"],
        "official_title": row["title"],
        "source_url": row["source_location"],
        "source_date": row["posted_at"],
        "effective_date": None,
    }


def add_step(
    branch_result_id: str,
    order: int,
    kind: str,
    relation_kind: str,
    basis: str,
    description: str,
    evidence_links: list[dict[str, Any]],
    **fields: Any,
) -> dict[str, Any]:
    step_id = stable_uuid("core:work-trace-step-v1", f"{branch_result_id}:{order}:{kind}:{relation_kind}")
    return {
        "trace_step_id": step_id,
        "branch_result_id": branch_result_id,
        "step_order": order,
        "step_kind": kind,
        "relation_kind": relation_kind,
        "step_basis": basis,
        "notice_id": fields.get("notice_id"),
        "regulation_id": fields.get("regulation_id"),
        "work_observation_id": fields.get("work_observation_id"),
        "function_assignment_id": fields.get("function_assignment_id"),
        "org_node_id": fields.get("org_node_id"),
        "change_event_id": fields.get("change_event_id"),
        "observed_at": fields.get("observed_at"),
        "effective_at": fields.get("effective_at"),
        "observed_phrase": fields.get("observed_phrase"),
        "matched_phrase": fields.get("matched_phrase"),
        "step_description": description,
        "evidence_links": evidence_links,
    }


def build_plan(
    config: dict[str, Any],
    notices: list[dict[str, Any]],
    relation_plan: dict[str, Any],
) -> dict[str, Any]:
    contract = config["trace_contract_version"]
    relation_contract = config["relation_contract_version"]
    if relation_plan.get("contract_version") != relation_contract:
        raise WorkTraceRunError("relation plan contract mismatch")

    relations_by_regulation: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for relation in relation_plan["relations"]:
        relations_by_regulation[relation["regulation_id"]].append(relation)
    relation_evidence = {
        item["evidence_reference_id"]: item for item in relation_plan["evidence_references"]
    }

    notice_refs = {row["notice_id"]: notice_evidence(contract, row) for row in notices}
    corpus_material = {
        "release_id": notices[0]["release_id"],
        "trace_contract_version": contract,
        "relation_contract_version": relation_contract,
        "relation_plan_digest": hashlib.sha256(
            canonical_json(
                {
                    "relations": relation_plan["relations"],
                    "evidence_references": relation_plan["evidence_references"],
                }
            )
        ).hexdigest(),
        "notices": [
            {
                "notice_id": row["notice_id"],
                "posted_at": row["posted_at"],
                "title": row["title"],
                "source_location": row["source_location"],
                "assertion_id": row.get("assertion_id"),
                "regulation_id": row.get("regulation_id"),
                "change_kind": row.get("change_kind"),
                "evidence_text": row.get("evidence_text"),
            }
            for row in notices
        ],
    }
    corpus_digest = hashlib.sha256(canonical_json(corpus_material)).hexdigest()
    release_id = notices[0]["release_id"]
    trace_run_id = stable_uuid("core:work-trace-run-v1", f"{release_id}:{contract}:{corpus_digest}")

    source_dates = [row["posted_at"] for row in notices]
    source_dates.extend(
        str(item[key])
        for item in relation_evidence.values()
        for key in ("source_date", "effective_date")
        if item.get(key)
    )
    evidence_cutoff = max(source_dates)
    logical_time = f"{evidence_cutoff}T23:59:59+00:00"
    run = {
        "trace_run_id": trace_run_id,
        "parent_trace_run_id": None,
        "release_id": release_id,
        "trace_contract_version": contract,
        "evidence_corpus_digest": corpus_digest,
        "evidence_cutoff_date": evidence_cutoff,
        "started_at": logical_time,
        "completed_at": logical_time,
        "run_result": "COMPLETED",
        "failure_detail": None,
    }

    branches: list[dict[str, Any]] = []
    needs_by_key: dict[str, dict[str, Any]] = {}
    used_evidence_ids: set[str] = set()
    outcome_counts: Counter[str] = Counter()
    completion_counts: Counter[str] = Counter()
    correspondence_basis_counts: Counter[str] = Counter()
    endpoint_width: Counter[int] = Counter()

    for row in notices:
        notice_ref = notice_refs[row["notice_id"]]
        used_evidence_ids.add(notice_ref["evidence_reference_id"])
        regulation_id = row.get("regulation_id") or None
        work_key = (
            f"PROPOSAL_ASSERTION:{row['assertion_id']}"
            if row.get("assertion_id")
            else f"UNRESOLVED_REGULATION:{row['notice_id']}"
        )
        case_id = stable_case_id(row["notice_id"], regulation_id, work_key)
        branch_result_id = stable_uuid("core:work-trace-branch-result-v1", f"{trace_run_id}:{case_id}")
        case = {
            "trace_case_id": case_id,
            "notice_id": row["notice_id"],
            "regulation_id": regulation_id,
            "work_observation_id": None,
            "work_observation_key": work_key,
            "observation_kind": "NOTICE_TITLE",
        }

        steps: list[dict[str, Any]] = []
        steps.append(
            add_step(
                branch_result_id,
                1,
                "NOTICE_OBSERVED",
                "NOTICE_SOURCE_RECORD",
                "OFFICIAL_DOCUMENT",
                "공식 사규예고 게시물과 게시일을 확인했습니다.",
                [{
                    "evidence_reference_id": notice_ref["evidence_reference_id"],
                    "evidence_role": "SUPPORTS_SOURCE",
                    "citation_order": 1,
                }],
                notice_id=row["notice_id"],
                observed_at=row["posted_at"],
                observed_phrase=row["title"],
            )
        )

        selected: list[dict[str, Any]] = []
        branch_break: dict[str, Any] | None = None
        terminal: str
        completion_scope: str | None = None
        public_summary: str
        last_step_id = steps[0]["trace_step_id"]
        last_verified_date = row["posted_at"]

        if not regulation_id:
            terminal = "RELATION_EVIDENCE_GAP"
            public_summary = config["public_interpretation"]["proposal_gap"]
            branch_break = {
                "branch_result_id": branch_result_id,
                "break_kind": terminal,
                "after_step_id": last_step_id,
                "next_known_step_id": None,
                "missing_relation": "NOTICE_TO_REGULATION_DIRECT_ASSERTION",
                "gap_from": row["posted_at"],
                "gap_to": None,
                "required_evidence_description": "사규예고가 제정·개정·폐지를 제안한 규정을 직접 확인할 공식 근거",
                "public_explanation": public_summary,
            }
            need_key = f"proposal-assertion:{row['notice_id']}"
            needs_by_key[need_key] = {
                "evidence_need_id": stable_uuid("core:work-trace-evidence-need-v1", f"{trace_run_id}:{need_key}"),
                "trace_run_id": trace_run_id,
                "need_key": need_key,
                "need_kind": terminal,
                "required_evidence_description": branch_break["required_evidence_description"],
                "period_from": row["posted_at"],
                "period_to": row["posted_at"],
                "branch_result_ids": [branch_result_id],
            }
        else:
            steps.append(
                add_step(
                    branch_result_id,
                    2,
                    "PROPOSES_CHANGE_TO",
                    "PROPOSES_CHANGE_TO",
                    "EXISTING_ASSERTION",
                    f"사규예고 제목에서 {row['change_kind']} 직접 assertion을 확인했습니다.",
                    [{
                        "evidence_reference_id": notice_ref["evidence_reference_id"],
                        "evidence_role": "SUPPORTS_RELATION",
                        "citation_order": 1,
                    }],
                    notice_id=row["notice_id"],
                    regulation_id=regulation_id,
                    observed_at=row["posted_at"],
                    observed_phrase=row["evidence_text"],
                )
            )
            last_step_id = steps[-1]["trace_step_id"]
            candidates = relations_by_regulation.get(regulation_id, [])
            direct = [item for item in candidates if item["correspondence_basis"] == "FUNCTION_DIRECT"]
            chosen = direct or [
                item for item in candidates if item["correspondence_basis"] == "FUNCTION_PHRASE_CANDIDATE"
            ]
            # Branch-only trace metadata must never mutate the reusable
            # relation plan. The original rows are replayed through the
            # idempotent writer later in apply_plan().
            selected = [dict(item) for item in chosen]
            endpoint_orgs = {item["org_node_id"] for item in selected}

            if direct and len(endpoint_orgs) == 1:
                terminal = "COMPLETE"
                completion_scope = config["completion_scope"]
                public_summary = config["public_interpretation"]["complete"]
            elif len(endpoint_orgs) > 1:
                terminal = "FUNCTION_MULTIPLE_CANDIDATES"
                public_summary = config["public_interpretation"]["multiple"]
            else:
                terminal = "FUNCTION_CORRESPONDENCE_UNCONFIRMED"
                public_summary = config["public_interpretation"]["function_gap"]

            for relation in selected:
                order = len(steps) + 1
                basis = relation["correspondence_basis"]
                regulation_evidence_id = relation["regulation_evidence_reference_id"]
                function_evidence_id = relation["function_evidence_reference_id"]
                if regulation_evidence_id not in relation_evidence or function_evidence_id not in relation_evidence:
                    raise WorkTraceRunError("a selected relation lacks evidence references")
                used_evidence_ids.update((regulation_evidence_id, function_evidence_id))
                if basis == "FUNCTION_DIRECT":
                    step_kind = "CURRENT_FUNCTION_OBSERVED"
                    step_basis = "OFFICIAL_DOCUMENT"
                    relation_kind = "REGULATION_CURRENT_FUNCTION_DIRECT"
                    links = [
                        {"evidence_reference_id": regulation_evidence_id, "evidence_role": "SUPPORTS_RELATION", "citation_order": 1},
                        {"evidence_reference_id": function_evidence_id, "evidence_role": "SUPPORTS_RELATION", "citation_order": 2},
                    ]
                else:
                    step_kind = "SEPARATE_CURRENT_OBSERVATION"
                    step_basis = "TEXT_COMPARISON"
                    relation_kind = "REGULATION_CURRENT_FUNCTION_PHRASE_CANDIDATE"
                    links = [
                        {"evidence_reference_id": regulation_evidence_id, "evidence_role": "SUPPORTS_TEXT_COMPARISON_SOURCE", "citation_order": 1},
                        {"evidence_reference_id": function_evidence_id, "evidence_role": "SUPPORTS_TEXT_COMPARISON_TARGET", "citation_order": 2},
                    ]
                function_evidence = relation_evidence[function_evidence_id]
                step = add_step(
                    branch_result_id,
                    order,
                    step_kind,
                    relation_kind,
                    step_basis,
                    "규정 관측 문구와 공식 현행 업무분장 문구를 근거별로 대조했습니다.",
                    links,
                    regulation_id=regulation_id,
                    function_assignment_id=relation["function_assignment_id"],
                    org_node_id=relation["org_node_id"],
                    effective_at=function_evidence.get("effective_date"),
                    observed_phrase=relation["regulation_observed_text"],
                    matched_phrase=relation["function_observed_text"],
                )
                steps.append(step)
                relation["trace_step_id"] = step["trace_step_id"]
                correspondence_basis_counts[basis] += 1

            if terminal == "FUNCTION_CORRESPONDENCE_UNCONFIRMED":
                next_known = steps[2]["trace_step_id"] if len(steps) > 2 else None
                branch_break = {
                    "branch_result_id": branch_result_id,
                    "break_kind": terminal,
                    "after_step_id": steps[1]["trace_step_id"],
                    "next_known_step_id": next_known,
                    "missing_relation": "REGULATION_TO_CURRENT_FUNCTION_OFFICIAL_RELATION",
                    "gap_from": row["posted_at"],
                    "gap_to": None,
                    "required_evidence_description": "해당 규정의 현행 소관 업무를 직접 뒷받침하는 공식 업무분장 또는 규정 관리 문구",
                    "public_explanation": public_summary,
                }
                need_key = f"regulation-function:{regulation_id}"
                if need_key not in needs_by_key:
                    needs_by_key[need_key] = {
                        "evidence_need_id": stable_uuid("core:work-trace-evidence-need-v1", f"{trace_run_id}:{need_key}"),
                        "trace_run_id": trace_run_id,
                        "need_key": need_key,
                        "need_kind": terminal,
                        "required_evidence_description": branch_break["required_evidence_description"],
                        "period_from": row["posted_at"],
                        "period_to": row["posted_at"],
                        "branch_result_ids": [],
                    }
                needs_by_key[need_key]["branch_result_ids"].append(branch_result_id)
                needs_by_key[need_key]["period_from"] = min(
                    needs_by_key[need_key]["period_from"], row["posted_at"]
                )
                needs_by_key[need_key]["period_to"] = max(
                    needs_by_key[need_key]["period_to"], row["posted_at"]
                )
            elif steps:
                last_step_id = steps[-1]["trace_step_id"]
                selected_dates = [
                    relation_evidence[item["function_evidence_reference_id"]].get("effective_date")
                    or relation_evidence[item["function_evidence_reference_id"]].get("source_date")
                    for item in selected
                ]
                selected_dates = [value for value in selected_dates if value]
                if selected_dates:
                    last_verified_date = max(selected_dates)

        correspondences = []
        for relation in selected:
            correspondence_id = stable_uuid(
                "core:work-trace-function-correspondence-v1",
                f"{branch_result_id}:{relation['regulation_function_correspondence_id']}",
            )
            correspondences.append(
                {
                    "correspondence_id": correspondence_id,
                    "branch_result_id": branch_result_id,
                    "trace_step_id": relation["trace_step_id"],
                    "regulation_function_correspondence_id": relation["regulation_function_correspondence_id"],
                    "org_node_id": relation["org_node_id"],
                    "function_assignment_id": relation["function_assignment_id"],
                    "correspondence_basis": relation["correspondence_basis"],
                    "comparison_contract_version": relation["comparison_contract_version"],
                    "observed_phrase": relation["regulation_observed_text"],
                    "matched_phrase": relation["function_observed_text"],
                    "comparison_score": relation["comparison_score"],
                }
            )

        result = {
            "branch_result_id": branch_result_id,
            "trace_run_id": trace_run_id,
            "trace_case_id": case_id,
            "terminal_outcome": terminal,
            "completion_scope": completion_scope,
            "last_verified_date": last_verified_date,
            "last_verified_step_id": last_step_id,
            "public_summary": public_summary,
        }
        branches.append(
            {
                "case": case,
                "result": result,
                "steps": steps,
                "branch_break": branch_break,
                "correspondences": correspondences,
                "correction": None,
            }
        )
        outcome_counts[terminal] += 1
        if completion_scope:
            completion_counts[completion_scope] += 1
        endpoint_width[len({item["org_node_id"] for item in selected})] += 1

    evidence = list(notice_refs.values()) + [
        relation_evidence[evidence_id]
        for evidence_id in sorted(used_evidence_ids)
        if evidence_id in relation_evidence
    ]
    evidence_by_id = {item["evidence_reference_id"]: item for item in evidence}
    evidence = [evidence_by_id[key] for key in sorted(evidence_by_id)]
    added_evidence = [
        {
            "evidence_reference_id": evidence_id,
            "added_reason": "Used by this release-scoped work trace run.",
        }
        for evidence_id in sorted(used_evidence_ids)
    ]

    return {
        "trace_contract_version": contract,
        "validation_contract_version": config["validation_contract_version"],
        "relation_contract_version": relation_contract,
        "mode": "preflight",
        "run": run,
        "summary": {
            "residual_notice_count": len(notices),
            "trace_case_count": len(branches),
            "terminal_outcomes": dict(sorted(outcome_counts.items())),
            "completion_scopes": dict(sorted(completion_counts.items())),
            "correspondence_basis": dict(sorted(correspondence_basis_counts.items())),
            "endpoint_width": {str(key): value for key, value in sorted(endpoint_width.items())},
            "evidence_reference_count": len(evidence),
            "evidence_need_count": len(needs_by_key),
            "leakage": {
                "notice_department_fields_read": 0,
                "person_identifiers_read": 0,
                "linked_regulation_version_ids_used_as_proposal": 0,
                "person_to_org_relations_created": 0,
            },
        },
        "evidence_references": evidence,
        "added_evidence": added_evidence,
        "branches": branches,
        "evidence_needs": [needs_by_key[key] for key in sorted(needs_by_key)],
    }


def rpc(name: str, payload: dict[str, Any]) -> Any:
    base_url = os.environ.get("KODIT_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("KODIT_SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not key:
        raise WorkTraceRunError("trusted Supabase writer credentials are not available")
    request = urllib.request.Request(
        f"{base_url}/rest/v1/rpc/{name}",
        data=canonical_json(payload),
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Content-Profile": "api",
            "Accept-Profile": "api",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise WorkTraceRunError(f"trusted writer rejected {name} ({error.code}): {detail[:500]}") from error


def batches(items: list[dict[str, Any]], size: int = WRITE_BATCH_SIZE) -> Iterable[list[dict[str, Any]]]:
    for offset in range(0, len(items), size):
        yield items[offset : offset + size]


def apply_plan(plan: dict[str, Any], relation_plan: dict[str, Any]) -> dict[str, int]:
    if os.environ.get("APPLY_WORK_TRACE_RUN") != plan["run"]["trace_run_id"]:
        raise WorkTraceRunError("set APPLY_WORK_TRACE_RUN to the planned trace_run_id")
    result = Counter()
    for batch in batches(relation_plan["evidence_references"], 250):
        ack = rpc("record_work_trace_evidence_batch", {"p_items": batch})
        result["relation_evidence_received"] += int(ack["received"])
        result["relation_evidence_inserted"] += int(ack["inserted"])
    for batch in batches(relation_plan["relations"], 250):
        ack = rpc("record_regulation_function_correspondence_batch", {"p_items": batch})
        result["relation_rows_received"] += int(ack["received"])
        result["relation_rows_inserted"] += int(ack["inserted"])
    for batch in batches(plan["evidence_references"], 250):
        ack = rpc("record_work_trace_evidence_batch", {"p_items": batch})
        result["evidence_received"] += int(ack["received"])
        result["evidence_inserted"] += int(ack["inserted"])
    ack = rpc(
        "record_work_trace_run_header",
        {"p_run": plan["run"], "p_added_evidence": plan["added_evidence"]},
    )
    result["run_inserted"] += int(ack["run_inserted"])
    for batch in batches(plan["branches"]):
        ack = rpc(
            "record_work_trace_branch_batch",
            {"p_trace_run_id": plan["run"]["trace_run_id"], "p_items": batch},
        )
        result["branches_received"] += int(ack["received"])
        result["results_inserted"] += int(ack["results_inserted"])
    for batch in batches(plan["evidence_needs"]):
        ack = rpc(
            "record_work_trace_evidence_need_batch",
            {"p_trace_run_id": plan["run"]["trace_run_id"], "p_items": batch},
        )
        result["needs_received"] += int(ack["received"])
        result["needs_inserted"] += int(ack["needs_inserted"])
    ack = rpc(
        "finalize_work_trace_run",
        {
            "p_trace_run_id": plan["run"]["trace_run_id"],
            "p_validation_contract_version": plan["validation_contract_version"],
        },
    )
    result["validated_branch_count"] = int(ack["branch_count"])
    return dict(result)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    config_path = args.config.resolve()
    config = json.loads(config_path.read_text(encoding="utf-8"))
    relation_path = (ROOT / config["relation_plan_path"]).resolve()
    relation_plan = json.loads(relation_path.read_text(encoding="utf-8"))
    module = load_query_module()
    notices = residual_notice_rows(module)
    plan = build_plan(config, notices, relation_plan)
    plan["config_sha256"] = sha256_file(config_path)
    plan["builder_sha256"] = sha256_file(Path(__file__).resolve())
    plan["relation_plan_sha256"] = sha256_file(relation_path)

    if args.apply:
        plan["mode"] = "apply"
        plan["apply_result"] = apply_plan(plan, relation_plan)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as output_file:
        output_file.write(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
    summary_path = args.output.with_name("summary.json")
    summary = {
        "trace_contract_version": plan["trace_contract_version"],
        "trace_run_id": plan["run"]["trace_run_id"],
        "mode": plan["mode"],
        **plan["summary"],
    }
    with summary_path.open("w", encoding="utf-8", newline="\n") as summary_file:
        summary_file.write(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except WorkTraceRunError as error:
        print(f"work trace run stopped: {error}", file=sys.stderr)
        raise SystemExit(2)
