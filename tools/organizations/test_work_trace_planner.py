"""Offline regression checks for the work-trace planner."""

from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def load_planner():
    path = ROOT / "tools/organizations/build_work_trace_run.py"
    spec = importlib.util.spec_from_file_location("work_trace_planner", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    planner = load_planner()
    config = json.loads((ROOT / "config/work-trace-run-v1.json").read_text(encoding="utf-8"))
    notice_id = "11111111-1111-1111-1111-111111111111"
    regulation_id = "22222222-2222-2222-2222-222222222222"
    function_assignment_id = "33333333-3333-3333-3333-333333333333"
    org_node_id = "44444444-4444-4444-4444-444444444444"
    regulation_evidence_id = "55555555-5555-5555-5555-555555555555"
    function_evidence_id = "66666666-6666-6666-6666-666666666666"
    correspondence_id = "77777777-7777-7777-7777-777777777777"

    notices = [{
        "release_id": "88888888-8888-8888-8888-888888888888",
        "notice_id": notice_id,
        "posted_at": "2026-01-02",
        "title": "테스트 규정 개정 사전예고",
        "source_location": "https://example.invalid/notice",
        "assertion_id": "99999999-9999-9999-9999-999999999999",
        "regulation_id": regulation_id,
        "change_kind": "AMEND",
        "evidence_text": "테스트 규정 개정",
    }]
    relation_plan = {
        "contract_version": config["relation_contract_version"],
        "relations": [{
            "regulation_function_correspondence_id": correspondence_id,
            "regulation_id": regulation_id,
            "function_assignment_id": function_assignment_id,
            "org_node_id": org_node_id,
            "correspondence_basis": "FUNCTION_DIRECT",
            "comparison_contract_version": config["relation_contract_version"],
            "comparison_method": "EXACT_REGULATION_MANAGEMENT_REFERENCE",
            "regulation_observed_text": "테스트 규정",
            "function_observed_text": "테스트 규정 관리",
            "comparison_score": 1.0,
            "regulation_evidence_reference_id": regulation_evidence_id,
            "function_evidence_reference_id": function_evidence_id,
        }],
        "evidence_references": [
            {
                "evidence_reference_id": regulation_evidence_id,
                "reference_kind": "REGULATION",
                "source_date": "2026-01-01",
                "effective_date": None,
            },
            {
                "evidence_reference_id": function_evidence_id,
                "reference_kind": "FUNCTION_ASSIGNMENT",
                "source_date": "2026-01-01",
                "effective_date": "2026-01-01",
            },
        ],
    }
    original = copy.deepcopy(relation_plan)
    plan = planner.build_plan(config, notices, relation_plan)

    assert relation_plan == original, "build_plan mutated reusable relation-plan rows"
    assert plan["summary"]["terminal_outcomes"] == {"COMPLETE": 1}
    assert plan["branches"][0]["correspondences"][0][
        "regulation_function_correspondence_id"
    ] == correspondence_id
    assert "trace_step_id" not in relation_plan["relations"][0]
    print("work trace planner mutation regression: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
