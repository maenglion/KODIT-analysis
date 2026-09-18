# Department Residual Resolution UI Contract

## Status / 기준 commit

- Status: **T06 IMPLEMENTED AND VERIFIED**
- Parent checkpoint: `9cece18aaff868bb8e4b63caf10f1be0ffc0ea3e`
- Inputs: T01 `NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL`, T04 `label-v1`, T05 `organization-v1`

## Purpose

사규예고 담당 표기의 exact-match 실패를 조직 오류로 오해하지 않도록 occurrence와
lexical label, 기존 type evidence, 기존 organization resolution을 분리해 공개한다.

## Current facts

| Resolution | Labels | Occurrences |
|---|---:|---:|
| PERSON_EVIDENCE | 317 | 1,113 |
| ORG_CURRENT | 3 | 30 |
| ORG_HISTORICAL | 2 | 15 |
| UNTYPED | 33 | 114 |
| AMBIGUOUS | 0 | 0 |
| **Total** | **355** | **1,272** |

전체 notice 2,089 = canonical exact 817 + residual occurrence 1,272다.

## Canonical sources

- occurrence: `publish.notice_department_residual_occurrences`
- occurrence→label: `core.notice_department_residual_labels`
- lexical type: `core.label_type_evidence`
- timeline/count: `core.label_metrics`
- organization resolution: `core.organization_label_assessments`
- organization node/AS_OF/lineage: T05 organization ledger

React는 이 분류를 재계산하지 않고 publish RPC를 읽는다.

## Resolution semantics

- `PERSON_EVIDENCE`: 동일 lexical label이 T03에서 PERSON mention으로 관측됐다. 실제 사람,
  직원, 기안자, 담당자 또는 소속을 확정하지 않는다.
- `ORG_CURRENT`: T05 `CURRENT_EXACT` assessment가 있다.
- `ORG_HISTORICAL`: T05 `CONFIRMED_NODE`이며 current exact가 아니다.
- `UNTYPED`: 현재 mention evidence로 lexical type을 확정하지 못했다.
- `AMBIGUOUS`: 복수 mention type evidence가 있다. 현재 residual 모집단에는 0개다.

## Public read model

- `publish.public_department_residual_analysis_rows()`: notice residual occurrence grain
- `publish.public_department_residual_label_rows()`: lexical label summary grain

두 함수는 current approved release만 반환하는 `SECURITY DEFINER`, fixed-search-path RPC다.
base table을 공개하지 않는다. 공개 가능한 source URL과 요약만 반환하고 internal evidence
text, extraction/parser provenance, local path는 반환하지 않는다.

## CSV grain

- 잔차 관측 CSV: 1 row = 1 notice residual occurrence
- 표기 요약 CSV: 1 row = 1 lexical label

두 파일의 행 수와 필드 의미를 섞지 않는다.

## Invariants

1. label category 합은 355다.
2. category occurrence 합은 1,272다.
3. broken notice/label/org FK는 0이다.
4. PERSON evidence는 entity 또는 affiliation으로 승격하지 않는다.
5. T05 `FUNCTION_TRANSFERRED_TO`는 특정 기능 이관으로만 표시한다.
6. T01~T05 immutable row를 UI에서 재작성하지 않는다.

## Extraction contamination boundary

T05의 `LEXICAL_EXTRACTION_CONTAMINATION` 13개는 T03 ORG-label 품질 문제이고 T01 residual
355-label 모집단에 포함되지 않는다. T06 담당 표기 잔차 통계와 합산하지 않으며 원
T03/T04 row도 수정하지 않는다.

## Non-goals

- PERSON entity, role, affiliation
- 새로운 ORG node/lineage inference
- graph visualization
- RULE lineage, topic/risk analysis
- OCR, embedding, vector

## Related migration / code paths

- `supabase/migrations/20260918000300_department_residual_analysis_read_model.sql`
- `packages/common/src/regulations/DepartmentResidualAnalysis.tsx`
- `packages/common/src/regulations/DepartmentStatistics.tsx`
- `apps/public-site/lib/review-data.ts`
- `tools/publish/check_department_residual_analysis_http.mjs`

## Decision history

| Date | Decision |
|---|---|
| 2026-09-18 | 1,272를 조직 수가 아닌 담당 표기 residual occurrence로 표시한다. |
| 2026-09-18 | label/occurrence count와 CSV grain을 분리한다. |
| 2026-09-18 | T06는 기존 type/node assessment만 투영하고 새 entity inference를 금지한다. |
