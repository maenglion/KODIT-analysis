"""T06.8 leakage-free known-answer evaluation against canonical function assignments.

The answer query is isolated from the feature query. The scorer receives no
department field, raw residual label, person, organization, or email mention.
Residual occurrences are deliberately not queried by this program.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import tempfile
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = ROOT / "config" / "org-function-positive-control-v4.json"
CLI = "supabase@2.117.0"
FORBIDDEN_KEYS = {
    "notice_department", "raw_label", "comparison_label", "person_mentions",
    "org_mentions", "email_mentions",
}


class EvaluationError(RuntimeError):
    pass


def query(sql: str) -> list[dict[str, Any]]:
    path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".sql", delete=False) as handle:
            handle.write(sql)
            path = Path(handle.name)
        command = [
            "npx.cmd" if os.name == "nt" else "npx", "--yes", CLI, "db", "query",
            "--linked", "--output-format", "json", "--file", str(path),
        ]
        completed = subprocess.run(
            command, cwd=ROOT, text=True, encoding="utf-8", capture_output=True, check=False,
        )
        if completed.returncode:
            detail = re.sub(r"(?i)(sbp_|eyJ)[A-Za-z0-9._-]+", "<REDACTED>", completed.stderr + completed.stdout)
            raise EvaluationError("Supabase CLI failed: " + " | ".join(detail.splitlines()[-12:]))
        payload = json.loads(completed.stdout)
        rows = payload.get("rows")
        if not isinstance(rows, list):
            raise EvaluationError("Supabase query returned no row array")
        return rows
    finally:
        if path:
            path.unlink(missing_ok=True)


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").casefold()
    return " ".join(re.findall(r"[가-힣a-z0-9]+", value))


def scrub(value: str, removals: Iterable[str]) -> str:
    result = unicodedata.normalize("NFKC", value or "")
    materialized = {x for x in removals if x}
    for item in sorted(materialized, key=len, reverse=True):
        result = re.sub(re.escape(item), " ", result, flags=re.IGNORECASE)
    result = normalized(result)
    # A second normalized-form pass makes the boundary robust to compatibility
    # normalization while still removing only explicitly enumerated names.
    for item in sorted({normalized(x) for x in materialized if normalized(x)}, key=len, reverse=True):
        result = re.sub(re.escape(item), " ", result, flags=re.IGNORECASE)
    compact = normalized(result).replace(" ", "")
    for item in sorted({normalized(x).replace(" ", "") for x in materialized if normalized(x)}, key=len, reverse=True):
        compact = compact.replace(item, "")
    return compact


def ngrams(value: str, sizes: list[int]) -> Counter[str]:
    compact = re.sub(r"\s+", "", normalized(value))
    result: Counter[str] = Counter()
    for size in sizes:
        result.update(compact[index:index + size] for index in range(max(0, len(compact) - size + 1)))
    return result


def cosine(left: Counter[str], right: Counter[str]) -> float:
    if not left or not right:
        return 0.0
    common = left.keys() & right.keys()
    numerator = sum(left[key] * right[key] for key in common)
    denominator = math.sqrt(sum(value * value for value in left.values())) * math.sqrt(
        sum(value * value for value in right.values())
    )
    return numerator / denominator if denominator else 0.0


def chunks(value: str, limit: int = 400) -> list[str]:
    pieces = re.split(r"[\n\r。.!?]+", value or "")
    return [piece[:limit] for piece in pieces if normalized(piece)] or ([value[:limit]] if normalized(value) else [])


def answer_rows() -> list[dict[str, Any]]:
    return query("""
with current_release as (select release_id from publish.current_release where singleton_key)
select n.notice_id::text,btrim(n.notice_department) answer_label,
  array_remove(array_agg(distinct o.org_node_id::text),null) answer_org_node_ids
from current_release c join publish.notices n using(release_id)
left join core.organization_nodes o
  on o.org_contract_version='organization-v1' and o.official_name=btrim(n.notice_department)
where publish.is_v06_canonical_notice_department(n.notice_department)
group by n.notice_id,btrim(n.notice_department)
order by n.notice_id;
""")


def assignment_rows() -> list[dict[str, Any]]:
    return query("""
select a.function_assignment_id::text,a.assignment_contract_version,a.assignment_key,a.work_string,
  a.org_node_id::text,n.official_name,n.node_status,char_length(a.work_string) phrase_char_count,
  min(sp.source_locator) source_locator
from analytics.canonical_organization_function_assignments a
join core.organization_nodes n using(org_node_id)
left join core.organization_function_assignment_spans af using(function_assignment_id)
left join core.organization_evidence_spans sp using(evidence_span_id)
group by a.function_assignment_id,a.assignment_contract_version,a.assignment_key,a.work_string,
  a.org_node_id,n.official_name,n.node_status
order by a.org_node_id,a.assignment_key,a.function_assignment_id;
""")


def detailed_rule_blocks() -> list[dict[str, Any]]:
    return query("""
with orgs(ord,name) as (values
 (1,'미래전략실'),(2,'리스크준법실'),(3,'안전전략실'),(4,'홍보협력실'),(5,'비서실'),
 (6,'경영기획부'),(7,'성과관리부'),(8,'ICT전략부'),(9,'AI혁신부'),(10,'신용보증부'),
 (11,'자본시장부'),(12,'스타트업금융부'),(13,'혁신금융부'),(14,'빅데이터부'),
 (15,'신용보험부'),(16,'기업개선부'),(17,'인프라금융부'),(18,'인재경영부'),
 (19,'업무지원부'),(20,'고객지원부'),(21,'비상계획부'),(22,'감사실')
), src as (
 select d.organization_evidence_document_id,d.extraction_id,e.extracted_text,strpos(e.extracted_text,'[별표3]') base
 from core.organization_evidence_documents d join core.document_extractions e using(extraction_id)
 where d.document_type='ORG_FUNCTION_ASSIGNMENT' and d.official_title like '본부점 세부운영기준(2026%'
), positions as (
 select o.*,src.*,src.base+strpos(substring(src.extracted_text from src.base),o.name||'1.')-1 pos
 from orgs o cross join src
), segments as (
 select p.*,coalesce(lead(pos) over(partition by organization_evidence_document_id order by pos),length(extracted_text)+1) next_pos
 from positions p
)
select s.name official_name,n.org_node_id::text,s.organization_evidence_document_id::text,s.extraction_id::text,
  s.pos-1 span_start,s.next_pos-1 span_end,
  substring(s.extracted_text from s.pos for greatest(s.next_pos-s.pos,1)) detailed_block
from segments s join core.organization_nodes n on n.official_name=s.name
  and n.org_contract_version in('organization-v1','organization-v1-evidence-r2')
where s.pos>=s.base and s.pos>0 order by s.ord;
""")


def compact(value: str) -> str:
    return re.sub(r"[^가-힣a-z0-9]+", "", unicodedata.normalize("NFKC", value or "").casefold())


def enriched_atomic_assignments(assignments: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    blocks = {row["org_node_id"]: row for row in detailed_rule_blocks()}
    originals: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in assignments:
        if row["assignment_contract_version"] == "org-function-assignment-v2" and row["assignment_key"].startswith("2026-org-rule:"):
            match = re.search(r"업무\s+(\d+)$", row.get("source_locator") or "")
            row = dict(row)
            row["duty_number"] = int(match.group(1)) if match else 9999
            originals[row["org_node_id"]].append(row)
    enriched: list[dict[str, Any]] = []
    missing_headers: list[dict[str, Any]] = []
    for org_id, rows in originals.items():
        rows.sort(key=lambda row: (row["duty_number"], row["function_assignment_id"]))
        block = blocks.get(org_id)
        if not block:
            missing_headers.extend({"org_node_id": org_id, "assignment_id": row["function_assignment_id"], "reason": "NO_DETAILED_BLOCK"} for row in rows)
            continue
        block_text = compact(block["detailed_block"])
        positions: list[tuple[int, dict[str, Any]]] = []
        cursor = 0
        for row in rows:
            header = compact(row["work_string"])
            found = block_text.find(header, cursor)
            if found < 0:
                missing_headers.append({"org_node_id": org_id, "assignment_id": row["function_assignment_id"], "reason": "HEADER_NOT_FOUND"})
                continue
            positions.append((found, row))
            cursor = found + len(header)
        for index, (start, row) in enumerate(positions):
            end = positions[index + 1][0] if index + 1 < len(positions) else len(block_text)
            item = dict(row)
            item["work_string"] = block_text[start:end]
            item["phrase_char_count"] = len(item["work_string"])
            item["profile_source"] = "DETAILED_RULE_HEADER_ALIGNED"
            item["detailed_document_id"] = block["organization_evidence_document_id"]
            item["detailed_extraction_id"] = block["extraction_id"]
            enriched.append(item)
    privacy = [dict(row, profile_source="CANONICAL_TEMPORAL_ASSIGNMENT") for row in assignments if row["assignment_contract_version"] == "org-function-assignment-v3"]
    enriched.extend(privacy)
    return enriched, {
        "detailed_block_count": len(blocks), "org_rule_assignment_count": sum(map(len, originals.values())),
        "enriched_assignment_count": len(enriched) - len(privacy), "temporal_assignment_count": len(privacy),
        "missing_header_count": len(missing_headers), "missing_headers": missing_headers,
    }


def numbered_detailed_assignments(assignments: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    blocks = detailed_rule_blocks()
    result: list[dict[str, Any]] = []
    audit_rows = []
    for block in blocks:
        flat = unicodedata.normalize("NFKC", block["detailed_block"] or "").casefold()
        flat = re.sub(r"[^가-힣a-z0-9.]+", "", flat)
        markers = [(match.start(), int(match.group(1))) for match in re.finditer(r"(?<![0-9])([0-9]{1,2})\.", flat)]
        selected: list[tuple[int, int]] = []
        expected = 1
        cursor = 0
        for position, number in markers:
            if position < cursor or number != expected:
                continue
            selected.append((position, number))
            expected += 1
            cursor = position + len(str(number)) + 1
        for index, (start, duty_number) in enumerate(selected):
            end = selected[index + 1][0] if index + 1 < len(selected) else len(flat)
            phrase = flat[start:end]
            result.append({
                "function_assignment_id": hashlib.md5(
                    f"kodit:t06.8:detailed-numbered-duty:{block['organization_evidence_document_id']}:{block['org_node_id']}:{duty_number}".encode()
                ).hexdigest(),
                "assignment_contract_version": "org-function-atomic-observation-v1",
                "assignment_key": f"detailed-numbered-duty:{block['organization_evidence_document_id']}:{block['org_node_id']}:{duty_number}",
                "work_string": phrase, "org_node_id": block["org_node_id"], "official_name": block["official_name"],
                "node_status": "CONFIRMED", "phrase_char_count": len(phrase),
                "profile_source": "OFFICIAL_DETAILED_RULE_NUMBERED_DUTY", "duty_number": duty_number,
                "detailed_document_id": block["organization_evidence_document_id"], "detailed_extraction_id": block["extraction_id"],
            })
        audit_rows.append({
            "org_node_id": block["org_node_id"], "official_name": block["official_name"],
            "marker_count": len(markers), "selected_monotonic_duty_count": len(selected),
            "selected_numbers": [number for _, number in selected],
        })
    privacy = [dict(row, profile_source="CANONICAL_TEMPORAL_ASSIGNMENT") for row in assignments if row["assignment_contract_version"] == "org-function-assignment-v3"]
    result.extend(privacy)
    return result, {
        "detailed_block_count": len(blocks), "numbered_duty_count": len(result) - len(privacy),
        "temporal_assignment_count": len(privacy), "organization_grain": audit_rows,
    }


def feature_rows(notice_ids: list[str]) -> list[dict[str, Any]]:
    ids = ",".join("'%s'::uuid" % item for item in notice_ids)
    # Deliberately does not SELECT or reference publish.notices.notice_department.
    return query(f"""
with target(notice_id) as (select unnest(array[{ids}])),
base as (
  select n.notice_id,n.title,n.notice_number
  from publish.current_release c join publish.notices n using(release_id)
  join target t using(notice_id)
), extractions as (
  select b.notice_id,array_agg(distinct de.extracted_text order by de.extracted_text) body_texts
  from base b
  join core.source_records sr on sr.external_key=b.notice_number
  join core.sources s on s.source_id=sr.source_id and s.source_code='kodit-preannouncement-preserved'
  join core.source_attachments sa on sa.source_record_id=sr.source_record_id
  join core.source_attachment_observations sao on sao.attachment_id=sa.attachment_id
  join core.parser_runs pr on pr.attachment_observation_id=sao.attachment_observation_id
  join core.document_extractions de on de.extraction_id=pr.extraction_id
  group by b.notice_id
), mentions as (
  select mr.notice_id,
    array_agg(distinct m.raw_text order by m.raw_text) filter(where m.mention_type='WORK') work_strings,
    array_agg(distinct m.raw_text order by m.raw_text) filter(where m.mention_type in('PERSON','ORG','EMAIL')) redactions,
    array_agg(distinct r.canonical_name order by r.canonical_name) filter(where rr.regulation_id is not null) regulation_names
  from analytics.mention_notice_resolution mr
  join target t using(notice_id)
  join core.extraction_mentions m using(mention_id)
  left join core.extraction_mention_labels ml on ml.mention_id=m.mention_id and ml.label_contract_version='label-v1'
  left join analytics.rule_label_resolution rr on rr.label_id=ml.label_id and rr.resolution_status='RESOLVED'
  left join core.regulations r on r.regulation_id=rr.regulation_id
  group by mr.notice_id
), proposals as (
  select a.notice_id,array_agg(distinct r.canonical_name order by r.canonical_name) proposal_names
  from analytics.notice_rule_change_assertions a join target t using(notice_id)
  join core.regulations r using(regulation_id)
  group by a.notice_id
)
select b.notice_id::text,b.title,
  coalesce(to_json(e.body_texts),'[]'::json) body_texts,
  coalesce(to_json(m.work_strings),'[]'::json) work_strings,
  coalesce(to_json(m.regulation_names),'[]'::json) regulation_names,
  coalesce(to_json(p.proposal_names),'[]'::json) proposal_names,
  coalesce(to_json(m.redactions),'[]'::json) redactions
from base b left join extractions e using(notice_id)
left join mentions m using(notice_id) left join proposals p using(notice_id)
order by b.notice_id;
""")


def parse_arrays(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        for key in ("body_texts", "work_strings", "regulation_names", "proposal_names", "redactions", "answer_org_node_ids"):
            if key in row and isinstance(row[key], str):
                row[key] = json.loads(row[key])


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered) - 1) * p
    lower, upper = math.floor(index), math.ceil(index)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - index) + ordered[upper] * (index - lower)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH.relative_to(ROOT)))
    parser.add_argument("--output", default="reports/measurements/2026-09-18-org-function-positive-control/result.json")
    args = parser.parse_args()
    config_path = ROOT / args.config
    config = json.loads(config_path.read_text(encoding="utf-8"))
    answers = answer_rows()
    parse_arrays(answers)
    if len(answers) != 817:
        raise EvaluationError(f"expected 817 positive controls, got {len(answers)}")

    assignments = assignment_rows()
    if len(assignments) != 202:
        raise EvaluationError(f"expected 202 canonical assignments, got {len(assignments)}")
    maximum = config.get("maximum_atomic_phrase_characters", 200)
    coarse = [row for row in assignments if row["phrase_char_count"] > maximum]
    if config.get("phrase_profile") == "OFFICIAL_NUMBERED_DUTY_ENRICHED_FROM_DETAILED_RULE":
        atomic, enrichment_audit = enriched_atomic_assignments(assignments)
    elif config.get("phrase_profile") == "OFFICIAL_DETAILED_RULE_NUMBERED_DUTY":
        atomic, enrichment_audit = numbered_detailed_assignments(assignments)
    else:
        atomic = [row for row in assignments if row["phrase_char_count"] <= maximum]
        enrichment_audit = None
    profiles: dict[str, list[dict[str, Any]]] = defaultdict(list)
    org_names: dict[str, str] = {}
    for row in atomic:
        profiles[row["org_node_id"]].append(row)
        org_names[row["org_node_id"]] = row["official_name"]

    features = feature_rows([row["notice_id"] for row in answers])
    parse_arrays(features)
    if len(features) != 817:
        raise EvaluationError(f"expected 817 feature rows, got {len(features)}")
    if any(FORBIDDEN_KEYS & row.keys() for row in features):
        raise EvaluationError("forbidden answer/provenance field reached feature payload")

    known_org_names = {row["official_name"] for row in assignments}
    known_org_names.update(row["answer_label"] for row in answers)
    sizes = config["character_ngram_sizes"]
    weights = config["channel_weights"]
    phrase_vectors = {
        org_id: [(row, ngrams(scrub(row["work_string"], known_org_names), sizes)) for row in rows]
        for org_id, rows in profiles.items()
    }

    predictions: dict[str, list[dict[str, Any]]] = {}
    feature_audit: dict[str, dict[str, Any]] = {}
    leaked_values: list[dict[str, str]] = []
    for row in features:
        removals = known_org_names | set(row["redactions"])
        channel_values = {
            "title": [scrub(row["title"], removals)],
            "body": [scrub(part, removals) for text in row["body_texts"] for part in chunks(text)],
            "regulation": [scrub(value, removals) for value in row["regulation_names"]],
            "proposal": [scrub(value, removals) for value in row["proposal_names"]],
            "work": [scrub(value, removals) for value in row["work_strings"]],
        }
        for answer in known_org_names:
            normalized_answer = normalized(answer).replace(" ", "")
            if normalized_answer and any(normalized_answer in value.replace(" ", "") for values in channel_values.values() for value in values):
                leaked_values.append({"notice_id": row["notice_id"], "value": answer})
        vectors = {key: [ngrams(value, sizes) for value in values if value] for key, values in channel_values.items()}
        feature_audit[row["notice_id"]] = {
            "has_body": bool(vectors["body"]), "has_work": bool(vectors["work"]),
            "has_regulation": bool(vectors["regulation"]), "has_proposal": bool(vectors["proposal"]),
            "has_non_title_signal": any(vectors[key] for key in ("body", "work", "regulation", "proposal")),
        }
        scored: list[dict[str, Any]] = []
        for org_id, p_vectors in phrase_vectors.items():
            channel_scores: dict[str, float] = {}
            best_assignment: str | None = None
            best_raw = 0.0
            for channel, value_vectors in vectors.items():
                best = 0.0
                for value_vector in value_vectors:
                    for assignment, phrase_vector in p_vectors:
                        current = cosine(value_vector, phrase_vector)
                        if current > best:
                            best = current
                        if current > best_raw:
                            best_raw = current
                            best_assignment = assignment["function_assignment_id"]
                channel_scores[channel] = best
            # Exact containment is materially different from fuzzy similarity:
            # an official duty explicitly naming a regulation/work string is a
            # direct lexical hit. Recompute only those configured channels.
            for channel in config.get("exact_containment_channels", []):
                minimum = config.get("minimum_exact_containment_characters", 4)
                exact = 0.0
                for value in channel_values[channel]:
                    value_compact = value.replace(" ", "")
                    if len(value_compact) < minimum:
                        continue
                    for assignment, _ in p_vectors:
                        phrase_compact = scrub(assignment["work_string"], known_org_names).replace(" ", "")
                        if value_compact in phrase_compact or (len(phrase_compact) >= minimum and phrase_compact in value_compact):
                            exact = 1.0
                            best_assignment = assignment["function_assignment_id"]
                            break
                    if exact:
                        break
                if exact:
                    channel_scores[channel] = 1.0
            score = sum(weights[channel] * channel_scores[channel] for channel in weights)
            scored.append({
                "org_node_id": org_id, "org_name": org_names[org_id], "score": round(score, 8),
                "best_assignment_id": best_assignment, "channel_scores": {k: round(v, 8) for k, v in channel_scores.items()},
            })
        scored.sort(key=lambda item: (-item["score"], item["org_name"], item["org_node_id"]))
        predictions[row["notice_id"]] = scored

    if leaked_values:
        raise EvaluationError(f"organization-name leakage remains after scrubbing: {leaked_values[:5]}")

    # Answers are joined only after every prediction has been produced.
    by_notice = {row["notice_id"]: row for row in answers}
    results = []
    confusion: Counter[tuple[str, str]] = Counter()
    strict_total = top1_hits = top3_hits = selected_top1_hits = covered = ambiguous = no_candidate = 0
    margins: list[float] = []
    for notice_id, scored in predictions.items():
        answer = by_notice[notice_id]
        answer_nodes = answer["answer_org_node_ids"]
        audit = feature_audit[notice_id]
        strict = (
            len(answer_nodes) == 1 and answer_nodes[0] in profiles and audit["has_non_title_signal"]
        )
        top1 = scored[0]
        top2 = scored[1]
        margin = top1["score"] - top2["score"]
        is_candidate = top1["score"] >= config["minimum_candidate_score"]
        is_ambiguous = is_candidate and margin < config["ambiguity_margin"]
        if strict:
            strict_total += 1
            margins.append(margin)
            if is_candidate:
                covered += 1
            else:
                no_candidate += 1
            if is_ambiguous:
                ambiguous += 1
            predicted = top1["org_node_id"] if is_candidate and not is_ambiguous else "AMBIGUOUS" if is_ambiguous else "NO_CANDIDATE"
            actual = answer_nodes[0]
            confusion[(answer["answer_label"], top1["org_name"] if predicted not in ("AMBIGUOUS", "NO_CANDIDATE") else predicted)] += 1
            if top1["org_node_id"] == actual:
                top1_hits += 1
            if actual in [item["org_node_id"] for item in scored[:3]]:
                top3_hits += 1
            if is_candidate and not is_ambiguous and top1["org_node_id"] == actual:
                selected_top1_hits += 1
        results.append({
            "notice_id": notice_id, "strict_subset": strict, "answer_label": answer["answer_label"],
            "answer_org_node_ids": answer_nodes, "feature_audit": audit,
            "top3": scored[:3], "top1_top2_margin": round(margin, 8),
            "candidate": is_candidate, "ambiguous": is_ambiguous,
        })

    if not strict_total:
        raise EvaluationError("strict evaluation subset is empty")
    config_hash = hashlib.sha256(config_path.read_bytes()).hexdigest()
    evaluator_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    assignment_lengths = [row["phrase_char_count"] for row in assignments]
    answer_by_notice = {row["notice_id"]: row for row in answers}
    exclusion_reasons = Counter()
    for notice_id, audit in feature_audit.items():
        answer_nodes = answer_by_notice[notice_id]["answer_org_node_ids"]
        if len(answer_nodes) != 1:
            exclusion_reasons["GROUND_TRUTH_NOT_UNIQUE"] += 1
        elif answer_nodes[0] not in profiles:
            exclusion_reasons["GROUND_TRUTH_HAS_NO_ATOMIC_ASSIGNMENT"] += 1
        elif not audit["has_non_title_signal"]:
            exclusion_reasons["NO_NON_TITLE_SIGNAL"] += 1
    report = {
        "contract_version": config["contract_version"], "config_sha256": config_hash,
        "evaluator_sha256": evaluator_hash,
        "population": {
            "known_answer_total": len(answers), "strict_subset": strict_total,
            "strict_excluded": len(answers) - strict_total,
            "exclusion_reasons": dict(sorted(exclusion_reasons.items())),
        },
        "leakage": {
            "forbidden_feature_key_count": 0, "organization_name_after_scrub_count": 0,
            "ground_truth_joined_after_prediction": True, "residual_rows_queried": False, "leakage_count": 0,
        },
        "phrase_grain_audit": {
            "canonical_assignment_count": len(assignments), "atomic_scorer_assignment_count": len(atomic),
            "coarse_assignment_count": len(coarse), "maximum_atomic_phrase_characters": maximum,
            "duplicate_phrase_group_count": sum(1 for count in Counter(row["work_string"] for row in assignments).values() if count > 1),
            "characters": {
                "min": min(assignment_lengths), "p50": percentile(assignment_lengths, .5),
                "p90": percentile(assignment_lengths, .9), "max": max(assignment_lengths),
            },
            "coarse_assignments": [{k: row[k] for k in ("function_assignment_id", "org_node_id", "official_name", "phrase_char_count")} for row in coarse],
            "enrichment_audit": enrichment_audit,
        },
        "metrics": {
            "coverage_count": covered, "coverage": covered / strict_total,
            "top1_correct": top1_hits, "top1_accuracy": top1_hits / strict_total,
            "top3_correct": top3_hits, "top3_recall": top3_hits / strict_total,
            "selected_top1_correct": selected_top1_hits,
            "ambiguous_count": ambiguous, "no_candidate_count": no_candidate,
            "margin_p10": percentile(margins, .1), "margin_p50": percentile(margins, .5), "margin_p90": percentile(margins, .9),
        },
        "confusion_matrix": [
            {"actual_org": actual, "predicted_org": predicted, "count": count}
            for (actual, predicted), count in sorted(confusion.items(), key=lambda item: (item[0][0], -item[1], item[0][1]))
        ],
        "organization_metrics": [],
        "rows": results,
    }
    for label in sorted({row["answer_label"] for row in results if row["strict_subset"]}):
        group = [row for row in results if row["strict_subset"] and row["answer_label"] == label]
        report["organization_metrics"].append({
            "organization": label, "count": len(group),
            "top1_correct": sum(row["top3"][0]["org_name"] == label for row in group),
            "top3_correct": sum(label in [item["org_name"] for item in row["top3"]] for row in group),
            "selected_top1_correct": sum(row["candidate"] and not row["ambiguous"] and row["top3"][0]["org_name"] == label for row in group),
            "ambiguous": sum(row["ambiguous"] for row in group),
            "no_candidate": sum(not row["candidate"] for row in group),
        })

    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes((json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    summary = {key: report[key] for key in ("contract_version", "config_sha256", "population", "leakage", "phrase_grain_audit", "metrics", "organization_metrics")}
    (output.parent / "summary.json").write_bytes(
        (json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
