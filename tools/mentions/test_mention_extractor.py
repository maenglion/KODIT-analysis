from __future__ import annotations

import json
from pathlib import Path

from mention_extractor import extract_mentions


CONFIG = json.loads((Path(__file__).with_name("mention-v1.json")).read_text(encoding="utf-8"))


def test_exact_lexical_mentions_and_spans() -> None:
    text = "신용보증부는 투자옵션부보증 운용기준과 보증연계투자를 검토한다. abc@kodit.or.kr"
    rows = extract_mentions(text, CONFIG, ["투자옵션부보증 운용기준"])
    observed = {(row["mention_type"], row["raw_text"]) for row in rows}
    assert ("ORG", "신용보증부") in observed
    assert ("RULE", "투자옵션부보증 운용기준") in observed
    assert ("WORK", "투자옵션부보증") in observed
    assert ("WORK", "보증연계투자") in observed
    assert ("EMAIL", "abc@kodit.or.kr") in observed
    for row in rows:
        assert text[row["span_start"] : row["span_end"]] == row["raw_text"]


def test_person_requires_explicit_cue_or_contact_block() -> None:
    text = "홍길동은 일반 문장이다. 담당자: 김민수. 담당자 전화 팩스 주소 대리 이경선 053-430-1234"
    rows = extract_mentions(text, CONFIG, [])
    people = {row["raw_text"] for row in rows if row["mention_type"] == "PERSON"}
    assert people == {"김민수", "이경선"}


def test_pattern_org_is_candidate_not_entity() -> None:
    text = "담당부서: 혁신금융부\n담당자 전화 팩스 주소 미래사업센터 박민수 053-430-1234"
    rows = extract_mentions(text, CONFIG, [])
    orgs = [row for row in rows if row["mention_type"] == "ORG"]
    assert {(row["raw_text"], row["extractor_rule"]) for row in orgs} == {
        ("혁신금융부", "ORG_CONTEXT_PATTERN_CANDIDATE"),
        ("미래사업센터", "ORG_CONTACT_BLOCK_PATTERN"),
    }
    assert all(row["evidence_metadata"]["candidate"] for row in orgs)


def test_longest_rule_match_wins_overlap() -> None:
    text = "투자옵션부보증 운용기준"
    rows = extract_mentions(text, CONFIG, ["투자옵션부보증", "투자옵션부보증 운용기준"])
    rules = [row["raw_text"] for row in rows if row["mention_type"] == "RULE"]
    assert rules == ["투자옵션부보증 운용기준"]
