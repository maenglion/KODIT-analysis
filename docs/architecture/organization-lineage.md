# Organization Evidence, Temporal Nodes, and Lineage

## Status / 기준 commit

- Status: **T05 IMPLEMENTED AND REMOTE VERIFIED**
- Parent checkpoint: `a8d28a921a9400cf3f8cc7db3e3fd5574a8fb12f`
- Contract: `organization-v1`
- Label input: `label-v1`

## Purpose

T04 lexical `ORG_LABEL`과 증거가 뒷받침하는 조직 단위 `ORG_NODE`를 분리한다. 시간축과
공식 근거를 갖춘 node 및 명시적으로 확인된 변화만 lineage로 보존한다.

## Current facts

- ORG labels: 40
- current official exact: 19
- historical confirmed: 8
- unresolved lexical extraction contamination: 13
- nodes / AS_OF relations: 27 / 27
- official evidence rows: 29
- lineage edges: `FUNCTION_TRANSFERRED_TO` 2, 다른 유형 0
- T04 preflight: unique KODIT mentions 14,349, source-expanded mention occurrences 14,417
- mention-bearing extractions 2,396 / all extractions 2,397

## Canonical sources

현재 조직 snapshot은 신용보증기금 공식 `부서별 업무 및 연락처` 페이지다. 과거 조직은
보존된 공식 사규예고 corpus의 exact extraction mention으로 확인한다. 개인정보보호 기능
이관 2건은 공식 `개인정보 처리방침 변경이력` 전후 비교표를 근거로 한다.

T01 `is_v06_canonical_notice_department()`의 20개 값은 release reproduction snapshot이며
역사 조직 ontology의 canonical dictionary가 아니다.

## Data model / relation semantics

- `core.organization_evidence`: 공식 관측 근거와 source/mention provenance
- `core.organization_nodes`: evidence-backed temporal institutional unit
- `core.organization_label_assessments`: 40개 ORG label의 전수 결과
- `core.organization_label_node_relations`: evidence-backed `AS_OF`
- `core.organization_lineage_edges`: 공식 direct evidence lineage

모든 row는 append-only이고 public/anon/authenticated에 공개하지 않는다. deterministic
identity와 `organization-v1` contract로 동일 backfill을 재현한다.

`FUNCTION_TRANSFERRED_TO`는 `edge_scope`에 적힌 기능의 이동만 뜻한다. whole-organization
rename, merger, succession을 뜻하지 않는다.

## Invariants

1. `ORG_LABEL ≠ ORG_NODE`.
2. 같은 이름만으로 같은 node 또는 연속 node를 만들지 않는다.
3. source 관측 first/last는 법적 valid-from/to로 승격하지 않는다.
4. 공식 직접 근거 없는 lineage edge는 생성하지 않는다.
5. self-loop, duplicate edge, broken FK, temporal conflict는 0이어야 한다.
6. PERSON/ORG co-occurrence로 affiliation을 만들지 않는다.
7. WORK/RULE 이동만으로 rename 또는 succession을 만들지 않는다.

## Non-goals

- PERSON entity resolution과 PERSON→ORG 관계
- RULE revision lineage 및 regulation proposal relation
- residual resolution UI
- topic/risk/statistical analysis
- OCR, embedding, vector, public API, UI

## Known gaps

13개 ORG-typed lexical label은 `주소...` prefix 또는 인접 문장의 붙음으로 생긴 extractor
contamination이다. T05는 원 T03/T04 label을 재작성하지 않고 `UNRESOLVED`로 남긴다.
과거 조직 8개의 정확한 신설·폐지 boundary는 공식 근거가 부족해 NULL이다.

## Future cautions

- 홍보실과 현재 홍보협력실, 4.0창업부와 현재 스타트업금융부처럼 이름·업무가 비슷해도
  직접 근거 없이 rename/succession edge를 만들지 않는다.
- T06은 T01 residual을 삭제하지 말고 별도 resolution status로 표현한다.
- current website snapshot이 바뀌면 기존 evidence를 갱신하지 말고 새 contract/run을 추가한다.

## Related migrations / code paths

- `supabase/migrations/20260918000200_organization_lineage_ledger.sql`
- `tools/organizations/organization-v1.json`
- `tools/organizations/backfill_organization_lineage.py`
- `tools/organizations/check_organization_lineage_contract.mjs`
- `tools/organizations/verify_organization_lineage.sql`
- `reports/measurements/2026-09-18-organization-lineage/`

## Decision history

| Date | Decision |
|---|---|
| 2026-09-18 | 40개 ORG label 전부를 평가하되 공식 근거 없는 label은 node에 붙이지 않는다. |
| 2026-09-18 | current snapshot 19개와 official corpus historical 8개만 node로 승격한다. |
| 2026-09-18 | 개인정보보호 담당 이동 2건은 whole-org succession이 아닌 scoped FUNCTION_TRANSFERRED_TO다. |
| 2026-09-18 | T01 residual reproduction dictionary와 historical organization ontology를 분리한다. |
