# KODIT Residual and Relation Ontology Workplan

## Status / 기준 commit

- Status: **T04 COMPLETE — T05 NEXT**
- T04 parent checkpoint: `7f452f9ab03d1aa5eae4e9c42cd1dcff524e32c4`

## Purpose

관측값, lexical label, entity/node, relation, analysis를 서로 다른 책임 계층으로
유지한다. 앞 계층의 존재만으로 다음 계층의 의미를 추정하지 않는다.

```text
Observation → Label → Entity/Node → Relation → Analysis
```

## Ticket sequence

```text
T01   department residual occurrence          완료
T02-A extraction persistence review           완료
T02-B extraction ledger                       완료
T02-C corpus extraction backfill              완료
T03   extraction mention occurrence           완료
T04   label aggregation + typing               완료
T05   historical ORG_NODE + lineage           다음
T06   residual resolution UI
T07   topic analysis
```

## Invariants

1. T01 department residual과 T03 extraction mention은 서로 다른 observation이다.
2. LABEL은 보수적으로 정규화한 문자열 identity이며 entity가 아니다.
3. mention type은 type evidence이지 실제 사람·조직 truth가 아니다.
4. `ORG_LABEL ≠ ORG_NODE`다.
5. relation과 topic은 각각 별도 근거·계약을 갖는다.
6. 후속 티켓은 이전 immutable observation을 덮어쓰지 않는다.

## Non-goals at the T04 checkpoint

- PERSON entity와 동명이인 분리
- historical/current ORG node와 조직 승계
- PERSON→ORG 소속·기안·담당 관계
- `PROPOSES_CHANGE_TO`, `POSSIBLY_INCORPORATED_INTO`
- topic, 위험도, 소송·투자·보증 분석
- OCR, embedding, public API, UI

## Related architecture

- `docs/architecture/notice-department-residual-ledger.md` (T01 계약; 저장소에 아직 없음)
- `docs/architecture/document-extraction-ledger.md`
- `docs/architecture/observation-label-entity-model.md`

## Decision history

| Date | Ticket | Decision |
|---|---|---|
| 2026-09-17 | T01 | exact-match 실패 notice occurrence를 중립 residual로 보존한다. |
| 2026-09-17 | T02 | binary/parser/extraction provenance를 immutable ledger로 고정한다. |
| 2026-09-17 | T03 | extraction exact span mention을 observation으로 보존한다. |
| 2026-09-18 | T04 | lexical label과 type evidence를 집계하되 entity/node로 승격하지 않는다. |
