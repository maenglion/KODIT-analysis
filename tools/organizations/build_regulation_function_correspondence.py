"""Build the work-trace regulation -> current-function relation ledger.

This builder never reads department residual rows and never uses
``notice_department`` while creating relations. It emits a many-to-many
relation plan:

* FUNCTION_DIRECT: the normalized regulation name is followed by an explicit
  management act (management/enactment/amendment/repeal/interpretation) in one
  official function assignment (score 1.0). Repeated table headers such as
  ``직제규정상 분담직무`` therefore do not become ownership relations.
* FUNCTION_PHRASE_CANDIDATE: a frozen character n-gram retrieval lead from the
  regulation name/full text to an official function assignment. It is not a
  confirmed owner and is never reduced to a single organization.

The exact-department notices are joined only after the relation plan exists.
Their result is labelled an observed-department reproduction diagnostic, not
current function-owner accuracy.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import statistics
import sys
import urllib.error
import urllib.request
import uuid
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = ROOT / "config/work-trace-regulation-function-v1.json"
DEFAULT_OUTPUT = (
    ROOT
    / "reports/measurements/2026-10-03-work-trace-regulation-function-v1/result.json"
)
WRITE_BATCH_SIZE = 250


class WorkTraceBuildError(RuntimeError):
    """A contract or trusted-writer stop condition."""


def load_positive_control_module():
    path = ROOT / "tools/organizations/evaluate_org_function_positive_control.py"
    spec = importlib.util.spec_from_file_location("work_trace_positive_control", path)
    if spec is None or spec.loader is None:
        raise WorkTraceBuildError("cannot load positive-control helpers")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def stable_uuid(namespace: str, key: str) -> str:
    return str(uuid.UUID(hashlib.md5(f"kodit:{namespace}:{key}".encode("utf-8")).hexdigest()))


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_json_array(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, str):
        parsed = json.loads(value)
        if not isinstance(parsed, list):
            raise WorkTraceBuildError("expected JSON array")
        return parsed
    if not isinstance(value, list):
        raise WorkTraceBuildError("expected array value")
    return value


def regulation_rows(module) -> list[dict[str, Any]]:
    rows = module.query(
        """
with current_release as (
  select release_id from publish.current_release where singleton_key
), base as (
  select p.release_id,r.regulation_id,p.regulation_id publish_regulation_id,
    p.regulation_version_id publish_regulation_version_id,p.display_name,p.source_location
  from current_release c
  join publish.regulations p using(release_id)
  join core.regulations r on r.canonical_name=p.display_name
), bodies as (
  select b.publish_regulation_version_id,
    array_agg(distinct e.extracted_text order by e.extracted_text)
      filter(where e.extracted_text is not null) extracted_texts
  from base b
  left join core.regulation_documents d
    on d.regulation_version_id=b.publish_regulation_version_id and d.document_role='fulltext'
  left join core.document_extractions e on e.document_sha256=d.document_sha256
  group by b.publish_regulation_version_id
)
select b.release_id::text,b.regulation_id::text,b.publish_regulation_id::text,
  b.publish_regulation_version_id::text,
  b.display_name,b.source_location,
  coalesce(to_json(x.extracted_texts),'[]'::json) extracted_texts
from base b left join bodies x using(publish_regulation_version_id)
order by b.regulation_id,b.publish_regulation_version_id;
"""
    )
    for row in rows:
        row["extracted_texts"] = parse_json_array(row.get("extracted_texts"))
    return rows


def assignment_rows(module) -> list[dict[str, Any]]:
    return module.query(
        """
select a.function_assignment_id::text,a.assignment_contract_version,a.assignment_key,
  a.work_string,a.org_node_id::text,n.official_name,
  a.organization_evidence_document_id::text,d.official_title,d.source_url,
  d.source_date::text,d.effective_date::text
from analytics.canonical_organization_function_assignments a
join core.organization_nodes n using(org_node_id)
join core.organization_evidence_documents d using(organization_evidence_document_id)
order by a.org_node_id,a.assignment_key,a.function_assignment_id;
"""
    )


def function_evidence_reference(contract: str, row: dict[str, Any]) -> dict[str, Any]:
    key = f"function-assignment:{row['function_assignment_id']}"
    return {
        "evidence_reference_id": stable_uuid(f"work-trace-evidence:{contract}", key),
        "evidence_contract_version": contract,
        "evidence_key": key,
        "reference_kind": "FUNCTION_ASSIGNMENT",
        "function_assignment_id": row["function_assignment_id"],
        "organization_evidence_document_id": row["organization_evidence_document_id"],
        "official_title": row["official_title"],
        "source_url": row["source_url"],
        "source_date": row["source_date"],
        "effective_date": row["effective_date"],
    }


def explicit_regulation_management_reference(
    regulation_compact: str, assignment_compact: str, minimum: int
) -> bool:
    if len(regulation_compact) < minimum:
        return False
    pattern = re.compile(
        re.escape(regulation_compact)
        + r"(?:등|및|관련|제규정|의){0,5}(?:관리|제정|개정|폐지|유권해석)"
    )
    return pattern.search(assignment_compact) is not None


def regulation_evidence_reference(contract: str, row: dict[str, Any]) -> dict[str, Any]:
    key = f"regulation:{row['regulation_id']}"
    return {
        "evidence_reference_id": stable_uuid(f"work-trace-evidence:{contract}", key),
        "evidence_contract_version": contract,
        "evidence_key": key,
        "reference_kind": "REGULATION",
        "regulation_id": row["regulation_id"],
        "official_title": row["display_name"],
        "source_url": row["source_location"],
        "source_date": None,
        "effective_date": None,
    }


def build_relations(
    module, config: dict[str, Any], regulations: list[dict[str, Any]], assignments: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    contract = config["contract_version"]
    known_org_names = {row["official_name"] for row in assignments}
    sizes = config["character_ngram_sizes"]
    minimum_exact = int(config["minimum_exact_characters"])
    minimum_candidate = float(config["search_candidate_minimum_score"])
    candidate_limit = int(config["candidate_org_limit"])
    chunk_limit = int(config["maximum_body_chunk_characters"])
    max_chunks = int(config["maximum_body_chunks_per_regulation"])
    weights = config["candidate_weights"]

    prepared_assignments = []
    function_evidence: dict[str, dict[str, Any]] = {}
    for assignment in assignments:
        clean = module.scrub(assignment["work_string"], known_org_names)
        prepared_assignments.append(
            {
                **assignment,
                "clean": clean,
                "compact": module.normalized(clean).replace(" ", ""),
                "vector": module.ngrams(clean, sizes),
            }
        )
        evidence = function_evidence_reference(contract, assignment)
        function_evidence[evidence["evidence_reference_id"]] = evidence

    relations: list[dict[str, Any]] = []
    evidence: dict[str, dict[str, Any]] = dict(function_evidence)
    direct_count = candidate_count = regulations_with_direct = regulations_with_candidate = 0
    direct_org_width: Counter[int] = Counter()
    candidate_org_width: Counter[int] = Counter()

    for regulation in regulations:
        reg_evidence = regulation_evidence_reference(contract, regulation)
        evidence[reg_evidence["evidence_reference_id"]] = reg_evidence
        name_clean = module.scrub(regulation["display_name"], known_org_names)
        name_compact = module.normalized(name_clean).replace(" ", "")
        name_vector = module.ngrams(name_clean, sizes)
        body_chunks = [
            module.scrub(piece, known_org_names)
            for text in regulation["extracted_texts"]
            for piece in module.chunks(str(text), chunk_limit)
        ][:max_chunks]
        body_vectors = [module.ngrams(piece, sizes) for piece in body_chunks if piece]

        direct: list[dict[str, Any]] = []
        scored_by_org: dict[str, dict[str, Any]] = {}
        for assignment in prepared_assignments:
            exact = explicit_regulation_management_reference(
                name_compact, assignment["compact"], minimum_exact
            )
            if exact:
                direct.append(assignment)
                continue
            name_score = module.cosine(name_vector, assignment["vector"])
            body_score = max(
                (module.cosine(vector, assignment["vector"]) for vector in body_vectors),
                default=0.0,
            )
            score = (
                float(weights["regulation_name"]) * name_score
                + float(weights["regulation_text"]) * body_score
            )
            current = scored_by_org.get(assignment["org_node_id"])
            if current is None or score > current["score"]:
                scored_by_org[assignment["org_node_id"]] = {
                    "score": score,
                    "assignment": assignment,
                }

        direct_orgs = {row["org_node_id"] for row in direct}
        if direct:
            regulations_with_direct += 1
            direct_org_width[len(direct_orgs)] += 1
        for assignment in direct:
            relation_id = stable_uuid(
                "core:regulation-function-correspondence-v1",
                f"{regulation['regulation_id']}:{assignment['function_assignment_id']}:FUNCTION_DIRECT:{contract}",
            )
            relations.append(
                {
                    "regulation_function_correspondence_id": relation_id,
                    "regulation_id": regulation["regulation_id"],
                    "function_assignment_id": assignment["function_assignment_id"],
                    "org_node_id": assignment["org_node_id"],
                    "correspondence_basis": "FUNCTION_DIRECT",
                    "comparison_contract_version": contract,
                    "comparison_method": "EXACT_REGULATION_MANAGEMENT_REFERENCE",
                    "regulation_observed_text": regulation["display_name"],
                    "function_observed_text": assignment["work_string"],
                    "comparison_score": 1,
                    "regulation_evidence_reference_id": reg_evidence["evidence_reference_id"],
                    "function_evidence_reference_id": function_evidence_reference(contract, assignment)["evidence_reference_id"],
                }
            )
            direct_count += 1

        candidate_rows = sorted(
            (
                value
                for org_id, value in scored_by_org.items()
                if org_id not in direct_orgs and value["score"] >= minimum_candidate
            ),
            key=lambda value: (
                -value["score"],
                value["assignment"]["official_name"],
                value["assignment"]["function_assignment_id"],
            ),
        )[:candidate_limit]
        if candidate_rows:
            regulations_with_candidate += 1
            candidate_org_width[len(candidate_rows)] += 1
        for item in candidate_rows:
            assignment = item["assignment"]
            relation_id = stable_uuid(
                "core:regulation-function-correspondence-v1",
                f"{regulation['regulation_id']}:{assignment['function_assignment_id']}:FUNCTION_PHRASE_CANDIDATE:{contract}",
            )
            relations.append(
                {
                    "regulation_function_correspondence_id": relation_id,
                    "regulation_id": regulation["regulation_id"],
                    "function_assignment_id": assignment["function_assignment_id"],
                    "org_node_id": assignment["org_node_id"],
                    "correspondence_basis": "FUNCTION_PHRASE_CANDIDATE",
                    "comparison_contract_version": contract,
                    "comparison_method": "CHARACTER_NGRAM_COSINE",
                    "regulation_observed_text": regulation["display_name"],
                    "function_observed_text": assignment["work_string"],
                    "comparison_score": round(item["score"], 6),
                    "regulation_evidence_reference_id": reg_evidence["evidence_reference_id"],
                    "function_evidence_reference_id": function_evidence_reference(contract, assignment)["evidence_reference_id"],
                }
            )
            candidate_count += 1

    assignment_lengths = sorted(len(row["work_string"]) for row in assignments)
    stats = {
        "regulations": len(regulations),
        "regulation_identity_bridge_rows": len(regulations),
        "regulation_identity_bridge_distinct_core_ids": len(
            {row["regulation_id"] for row in regulations}
        ),
        "regulation_identity_bridge_distinct_publish_versions": len(
            {row["publish_regulation_version_id"] for row in regulations}
        ),
        "canonical_function_assignments": len(assignments),
        "canonical_function_assignment_orgs": len({row["org_node_id"] for row in assignments}),
        "canonical_function_assignment_documents": len(
            {row["organization_evidence_document_id"] for row in assignments}
        ),
        "function_assignment_character_grain": {
            "minimum": min(assignment_lengths),
            "median": statistics.median(assignment_lengths),
            "p90": statistics.quantiles(assignment_lengths, n=10, method="inclusive")[8],
            "maximum": max(assignment_lengths),
            "at_least_1000": sum(length >= 1000 for length in assignment_lengths),
        },
        "direct_relations": direct_count,
        "candidate_relations": candidate_count,
        "regulations_with_direct": regulations_with_direct,
        "regulations_with_candidate": regulations_with_candidate,
        "regulations_without_any_relation": len(regulations)
        - len({row["regulation_id"] for row in relations}),
        "direct_distinct_org_width": dict(sorted(direct_org_width.items())),
        "candidate_distinct_org_width": dict(sorted(candidate_org_width.items())),
    }
    return list(evidence.values()), relations, stats


def observed_department_diagnostic(
    module,
    assignments: list[dict[str, Any]],
    regulations: list[dict[str, Any]],
    relations: list[dict[str, Any]],
) -> dict[str, Any]:
    answers = module.answer_rows()
    module.parse_arrays(answers)
    features = module.feature_rows([row["notice_id"] for row in answers])
    module.parse_arrays(features)
    if len(answers) != 817 or len(features) != 817:
        raise WorkTraceBuildError("known-answer population is not 817")

    answer_map = {row["notice_id"]: row for row in answers}
    feature_map = {row["notice_id"]: row for row in features}
    name_to_regulation_ids: dict[str, set[str]] = defaultdict(set)
    for row in regulations:
        name_to_regulation_ids[row["display_name"]].add(row["regulation_id"])
    relation_map: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in relations:
        relation_map[row["regulation_id"]].append(row)
    profile_orgs = {row["org_node_id"] for row in assignments}

    strict = []
    for notice_id, feature in feature_map.items():
        answer = answer_map[notice_id]
        answer_nodes = answer["answer_org_node_ids"]
        has_non_title = any(
            feature[key]
            for key in ("body_texts", "work_strings", "regulation_names", "proposal_names")
        )
        if len(answer_nodes) == 1 and answer_nodes[0] in profile_orgs and has_non_title:
            strict.append((notice_id, feature, answer))
    if len(strict) != 728:
        raise WorkTraceBuildError(f"strict diagnostic subset {len(strict)} != 728")

    signal_rows = [
        item for item in strict if item[1]["regulation_names"] or item[1]["proposal_names"]
    ]
    if len(signal_rows) != 696:
        raise WorkTraceBuildError(f"regulation/proposal diagnostic subset {len(signal_rows)} != 696")

    counts = Counter()
    endpoint_width = Counter()
    for _, feature, answer in signal_rows:
        regulation_ids: set[str] = set()
        for name in feature["regulation_names"] + feature["proposal_names"]:
            regulation_ids.update(name_to_regulation_ids.get(name, set()))
        rows = [relation for regulation_id in regulation_ids for relation in relation_map.get(regulation_id, [])]
        direct_orgs = {row["org_node_id"] for row in rows if row["correspondence_basis"] == "FUNCTION_DIRECT"}
        all_orgs = {row["org_node_id"] for row in rows}
        answer_org = answer["answer_org_node_ids"][0]
        if direct_orgs:
            counts["direct_coverage"] += 1
        if answer_org in direct_orgs:
            counts["direct_observed_department_included"] += 1
        if all_orgs:
            counts["all_relation_coverage"] += 1
        if answer_org in all_orgs:
            counts["all_relation_observed_department_included"] += 1
        if len(all_orgs) > 1:
            counts["multiple_current_org_endpoints"] += 1
        if not all_orgs:
            counts["no_relation_candidate"] += 1
        endpoint_width[len(all_orgs)] += 1

    return {
        "metric_name": "OBSERVED_DEPARTMENT_REPRODUCTION_DIAGNOSTIC",
        "interpretation_warning": (
            "The observed notice department is not a function-owner gold label. "
            "Inclusion counts are diagnostics only and are not current-function accuracy."
        ),
        "known_answer_total": 817,
        "strict_subset": 728,
        "regulation_or_proposal_signal_subset": 696,
        **dict(counts),
        "endpoint_width": dict(sorted(endpoint_width.items())),
        "leakage": {
            "department_input_count": 0,
            "ground_truth_joined_after_relations": True,
            "residual_rows_queried": False,
            "count": 0,
        },
    }


def rpc(name: str, payload: dict[str, Any]) -> Any:
    base_url = os.environ.get("KODIT_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("KODIT_SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not key:
        raise WorkTraceBuildError("trusted Supabase writer credentials are not available")
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
        raise WorkTraceBuildError(f"trusted writer rejected {name} ({error.code}): {detail[:500]}") from error


def batches(items: list[dict[str, Any]], size: int = WRITE_BATCH_SIZE) -> Iterable[list[dict[str, Any]]]:
    for offset in range(0, len(items), size):
        yield items[offset : offset + size]


def apply_plan(evidence: list[dict[str, Any]], relations: list[dict[str, Any]]) -> dict[str, int]:
    result = Counter()
    for batch in batches(evidence):
        ack = rpc("record_work_trace_evidence_batch", {"p_items": batch})
        result["evidence_received"] += int(ack["received"])
        result["evidence_inserted"] += int(ack["inserted"])
    for batch in batches(relations):
        ack = rpc("record_regulation_function_correspondence_batch", {"p_items": batch})
        result["relations_received"] += int(ack["received"])
        result["relations_inserted"] += int(ack["inserted"])
    return dict(result)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG.relative_to(ROOT)))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT.relative_to(ROOT)))
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirmation", default="")
    args = parser.parse_args()

    config_path = ROOT / args.config
    config = json.loads(config_path.read_text(encoding="utf-8"))
    module = load_positive_control_module()
    regulations = regulation_rows(module)
    assignments = assignment_rows(module)
    if len(regulations) != 1041:
        raise WorkTraceBuildError(f"approved regulation population {len(regulations)} != 1041")
    if len({row["regulation_id"] for row in regulations}) != 1041:
        raise WorkTraceBuildError("publish-to-core regulation bridge is not one-to-one")
    if len({row["publish_regulation_version_id"] for row in regulations}) != 1041:
        raise WorkTraceBuildError("current publish regulation version grain is not unique")
    if len(assignments) != 202:
        raise WorkTraceBuildError(f"canonical function assignment population {len(assignments)} != 202")

    evidence, relations, relation_stats = build_relations(
        module, config, regulations, assignments
    )
    diagnostic = observed_department_diagnostic(
        module, assignments, regulations, relations
    )
    report: dict[str, Any] = {
        "contract_version": config["contract_version"],
        "config_sha256": sha256_file(config_path),
        "builder_sha256": sha256_file(Path(__file__)),
        "mode": "apply" if args.apply else "preflight",
        "relation_stats": relation_stats,
        "positive_control_diagnostic": diagnostic,
        "evidence_reference_count": len(evidence),
        "relations": relations,
        "evidence_references": evidence,
    }
    if args.apply:
        if args.confirmation != "APPLY_WORK_TRACE_RELATIONS":
            raise WorkTraceBuildError(
                "--apply requires --confirmation APPLY_WORK_TRACE_RELATIONS"
            )
        report["trusted_writer"] = apply_plan(evidence, relations)

    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes((json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    summary = {key: report[key] for key in (
        "contract_version", "config_sha256", "builder_sha256", "mode",
        "relation_stats", "positive_control_diagnostic", "evidence_reference_count"
    )}
    (output.parent / "summary.json").write_bytes(
        (json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"work-trace relation build failed: {error}", file=sys.stderr)
        raise SystemExit(1)
