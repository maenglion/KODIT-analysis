"""Deterministic lexical mention extraction for T03.

Mention types are observations, not confirmed labels or entities. Offsets are
zero-based Python/Unicode code-point offsets with an exclusive end.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable


EMAIL_RE = re.compile(
    r"(?<![A-Za-z0-9.!#$%&'*+/=?^_`{|}~-])"
    r"[A-Za-z0-9][A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{0,63}"
    r"@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+"
    r"(?![A-Za-z0-9.!#$%&'*+/=?^_`{|}~-])"
)


@dataclass(frozen=True)
class Mention:
    mention_type: str
    span_start: int
    span_end: int
    raw_text: str
    extractor_rule: str
    evidence_metadata: dict[str, Any]

    def as_dict(self) -> dict[str, Any]:
        return {
            "mention_type": self.mention_type,
            "span_start": self.span_start,
            "span_end": self.span_end,
            "raw_text": self.raw_text,
            "extractor_rule": self.extractor_rule,
            "evidence_metadata": self.evidence_metadata,
        }


def _alternation(values: Iterable[str]) -> str:
    ordered = sorted({value for value in values if value}, key=lambda x: (-len(x), x))
    return "(?:" + "|".join(re.escape(value) for value in ordered) + ")"


def _exact_mentions(
    text: str,
    values: Iterable[str],
    mention_type: str,
    extractor_rule: str,
) -> list[Mention]:
    values = tuple(values)
    if not values:
        return []
    pattern = re.compile(_alternation(values))
    return [
        Mention(
            mention_type,
            match.start(),
            match.end(),
            match.group(0),
            extractor_rule,
            {},
        )
        for match in pattern.finditer(text)
    ]


def _contact_patterns(config: dict[str, Any]) -> tuple[re.Pattern[str], re.Pattern[str]]:
    org = (
        r"(?P<org>[가-힣A-Za-z0-9.·]{2,24}"
        + _alternation(config["organization_suffixes"])
        + r")"
    )
    title = _alternation(config["person_titles"])
    address = r"(?:주\s*소|주소)"
    phone = r"(?=\s*\d{2,3}\s*-\s*\d{3,4}\s*-?\s*\d{0,4})"
    before = re.compile(
        address
        + r"\s*(?:"
        + org
        + r"\s*)?(?:(?:"
        + title
        + r")\s*)?(?P<person>[가-힣]{2,4})\s*(?:(?:"
        + title
        + r")\s*)?"
        + phone
    )
    after = re.compile(
        address
        + r"\s*(?:"
        + org
        + r"\s*)?(?P<person>[가-힣]{2,4})\s+(?:"
        + title
        + r")\s*"
        + phone
    )
    return before, after


def extract_mentions(
    text: str,
    config: dict[str, Any],
    rule_names: Iterable[str],
) -> list[dict[str, Any]]:
    mentions: list[Mention] = []
    mentions.extend(_exact_mentions(text, rule_names, "RULE", "RULE_CANONICAL_NAME_EXACT"))
    mentions.extend(
        _exact_mentions(text, config["known_organizations"], "ORG", "KNOWN_ORG_EXACT")
    )
    mentions.extend(
        _exact_mentions(text, config["work_lexicon"], "WORK", "WORK_LEXICON_EXACT")
    )

    for match in EMAIL_RE.finditer(text):
        mentions.append(
            Mention(
                "EMAIL", match.start(), match.end(), match.group(0),
                "EMAIL_RFC5322_LEXICAL", {},
            )
        )

    titles = _alternation(config["person_titles"])
    direct = re.compile(
        _alternation(config["person_direct_cues"])
        + r"\s*[:：]\s*(?:(?:" + titles
        + r")\s*)?(?P<person>[가-힣]{2,4})(?![가-힣])"
    )
    rejected = set(config["person_reject_terms"])
    for match in direct.finditer(text):
        person = match.group("person")
        if person in rejected:
            continue
        start, end = match.span("person")
        mentions.append(
            Mention(
                "PERSON", start, end, person, "PERSON_EXPLICIT_CUE",
                {"cue": match.group(0)[: match.start("person") - match.start()]},
            )
        )

    exact_org_spans = {
        (mention.span_start, mention.span_end)
        for mention in mentions if mention.mention_type == "ORG"
    }
    for pattern in _contact_patterns(config):
        for match in pattern.finditer(text):
            person = match.group("person")
            if person not in rejected:
                start, end = match.span("person")
                mentions.append(
                    Mention(
                        "PERSON", start, end, person,
                        "PERSON_CONTACT_BLOCK_PHONE", {},
                    )
                )
            org = match.groupdict().get("org")
            if org:
                start, end = match.span("org")
                if (start, end) not in exact_org_spans:
                    mentions.append(
                        Mention(
                            "ORG", start, end, org,
                            "ORG_CONTACT_BLOCK_PATTERN", {"candidate": True},
                        )
                    )

    org_candidate = re.compile(
        _alternation(config["organization_context_cues"])
        + r"\s*[:：]?\s*(?P<org>[가-힣A-Za-z0-9.·]{2,24}"
        + _alternation(config["organization_suffixes"])
        + r")(?![가-힣])"
    )
    for match in org_candidate.finditer(text):
        start, end = match.span("org")
        if (start, end) in exact_org_spans:
            continue
        mentions.append(
            Mention(
                "ORG", start, end, match.group("org"),
                "ORG_CONTEXT_PATTERN_CANDIDATE", {"candidate": True},
            )
        )

    priority = {
        "RULE_CANONICAL_NAME_EXACT": 0,
        "KNOWN_ORG_EXACT": 0,
        "WORK_LEXICON_EXACT": 0,
        "EMAIL_RFC5322_LEXICAL": 0,
        "PERSON_EXPLICIT_CUE": 0,
        "PERSON_CONTACT_BLOCK_PHONE": 1,
        "ORG_CONTACT_BLOCK_PATTERN": 1,
        "ORG_CONTEXT_PATTERN_CANDIDATE": 2,
    }
    mentions.sort(
        key=lambda item: (
            item.mention_type, item.span_start, item.span_end,
            priority[item.extractor_rule], item.extractor_rule,
        )
    )
    unique: dict[tuple[str, int, int], Mention] = {}
    for mention in mentions:
        key = (mention.mention_type, mention.span_start, mention.span_end)
        unique.setdefault(key, mention)

    result = sorted(unique.values(), key=lambda item: (item.span_start, item.span_end, item.mention_type))
    for mention in result:
        if text[mention.span_start : mention.span_end] != mention.raw_text:
            raise ValueError("mention span contract violated")
    return [mention.as_dict() for mention in result]
