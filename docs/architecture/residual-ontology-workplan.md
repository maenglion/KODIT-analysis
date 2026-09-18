# KODIT Residual and Relation Ontology Workplan

## Status / 기준 commit

- Status: **T06 COMPLETE — T07 NEXT**
- T05 parent checkpoint: `a8d28a921a9400cf3f8cc7db3e3fd5574a8fb12f`

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
T05   historical ORG_NODE + lineage           완료
T06   residual resolution UI                  완료
T07   topic analysis                          다음
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

## T05 boundary

T05는 40개 ORG lexical label을 공식 근거로 평가해 27개 조직 node와 27개 `AS_OF`
관계를 생성했다. 현재 공식 조직 exact match 19개, 과거 공식 문서로 확인한 조직 8개,
lexical extraction contamination으로 미해결 13개다. 동일 이름만으로 시대가 다른
조직을 합치지 않으며, 근거 없는 승계 관계도 생성하지 않는다.

공식 개인정보 처리방침 전후표가 특정 기능의 담당 부서 이동을 직접 보여주는 2건만
`FUNCTION_TRANSFERRED_TO`로 남겼다. 이 edge는 조직 전체의 rename 또는 succession을
뜻하지 않는다. T06은 이 원장을 읽을 수 있지만 T01 residual occurrence를 삭제하거나
재작성해서는 안 된다.

## T06 boundary

T06은 T01의 1,272 occurrence와 T04/T05의 기존 evidence를 current approved release용
public-safe read model로 투영한다. 355 lexical label은 인물 표기 317, 현재 조직 3,
과거 조직 2, 미분류 33으로 표시하며 새 entity inference를 하지 않는다. occurrence CSV와
label-summary CSV는 grain이 다르므로 별도로 제공한다.

T05의 lexical extraction contamination 13개는 T01 residual 모집단이 아니며 담당 표기
잔차 통계에 합산하지 않는다. T06 UI는 graph, affiliation, role, topic을 만들지 않는다.

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
| 2026-09-18 | T05 | 공식 근거가 있는 ORG label만 time-aware node로 승격하고 scoped function-transfer edge만 기록한다. |
| 2026-09-18 | T06 | 기존 occurrence/label/node 원장을 current-release public read model로 투영하고 두 CSV grain을 분리한다. |
