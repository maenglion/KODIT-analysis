# Temporal Function Profiles and As-of Positive Control

## Status / 기준 commit

- Status: **T06.8.2 COMPLETE; HISTORICAL ENACTED EVIDENCE GAP; RESIDUAL NOT APPLIED**
- Parent checkpoint: `f406723f3f520c3f67641894738d95c130e4646e`
- Contract: `temporal-function-profile-v1`

## Purpose

notice를 게시시점과 겹치는 공식 organization/function profile에만 비교한다. 2026 function
profile을 과거 notice에 소급 적용하던 683건의 temporal conflict를 제거하고, as-of gold의
근거 범위를 명시한다.

## Current facts

- T06.7 historical documents: 42
- `PROPOSED_AMENDMENT`: 42
- historical `ENACTED_FULL_TEXT`: 0
- `AMENDMENT_ENACTED`: 0
- proposal의 official effective-date evidence: 0
- historical→enacted version-chain link: 0
- current enacted evidence: 직제규정 1, 본부점 세부운영기준 1, 직무전결요령 1

따라서 42개 사전예고는 temporal epoch의 입력 후보이지만 시행 profile은 아니다.

## Canonical sources

- document/version: `core.organization_evidence_documents`, `core.organization_document_versions`
- series: `core.organization_document_series`, `core.organization_document_version_series`
- function validity: `analytics.canonical_organization_function_assignments`
- snapshot: `core.organization_snapshots`, `core.organization_snapshot_observations`
- positive control: current approved release의 exact-department 817건

## Data model / relation semantics

```text
PROPOSED_AMENDMENT
≠ AMENDMENT_ENACTED
≠ ENACTED_FULL_TEXT
```

공식 사전예고의 게시일은 시행일이 아니다. effective date와 enacted version chain이 없는
proposal로 organization/function epoch를 만들지 않는다.

현재 측정 가능한 profile은 다음뿐이다.

```text
~ 2024-04-24       개인정보 기능: 리스크관리실        scoped partial
2024-04-24~2026-01-29 개인정보 기능: 리스크준법실     scoped partial
2026-01-29~2026-07-02 개인정보 기능: 안전전략실       scoped partial
2026-07-02~          2026 multi-org function profile   current multi-org
```

앞의 세 epoch는 개인정보 기능 하나만 표현한다. 조직 전체 candidate universe가 아니므로
multiclass organization accuracy로 사용하지 않는다.

## Gold semantics

- `ASOF_DEPARTMENT_GOLD`: official snapshot epoch가 exact observed department node를 지지
- `ASOF_FUNCTION_GOLD_COMPLETE`: complete multi-org profile에서 answer node의 assignment가 유효
- `ASOF_FUNCTION_GOLD_SCOPED`: 단일 scoped function epoch에서 answer node assignment가 유효
- `NO_MATCHING_TEMPORAL_PROFILE`: 해당 notice 시점에 answer node의 공식 profile이 없음

817건 중 department gold 23, function gold 45이며, function gold는 complete 27 + scoped 18이다.
strict 728건 중 683건은 `NO_MATCHING_TEMPORAL_PROFILE`이다. 기존 temporal conflict로 두지 않는다.

## Positive-control result

Complete current multi-org gold 27건:

- coverage 24/27 (88.89%)
- top-1 17/27 (62.96%)
- top-3 22/27 (81.48%)
- ambiguous 7
- no-match 3
- non-ambiguous accepted precision 12/17 (70.59%)

Scoped historical gold 18건은 coverage 3/18이다. candidate universe가 단일 privacy function으로
불완전하므로 raw rank 18/18은 multiclass accuracy가 아니며 AUTO_ACCEPT 근거로 사용하지 않는다.

## Invariants

1. profile의 valid interval과 notice `posted_date`가 겹칠 때만 scorer 후보가 된다.
2. `notice_department`와 department-derived 값은 answer label 외 feature에 들어가지 않는다.
3. proposal은 시행 근거로 승격하지 않는다.
4. incomplete scoped epoch의 rank accuracy를 multi-org accuracy로 보고하지 않는다.
5. historical enacted evidence가 없으면 calibration/holdout을 만들지 않는다.
6. residual 1,272건은 validation gate 전 조회·적용하지 않는다.

## Non-goals

- 42개 proposal에서 시행일 추정
- snapshot 차이로 enacted organization change 생성
- official evidence 없는 regulation stewardship
- residual versioned run
- T07 UI

## Known gaps

- 2022~2026 과거 직제규정·본부점 세부운영기준 시행본이 없다.
- 42개 proposal과 실제 시행본 사이 version chain이 없다.
- 2015~2021 proposal은 존재하지만 positive-control corpus는 2022부터 시작한다.
- 2024~2026 개인정보 기능 외 historical function universe는 불완전하다.

## Future cautions

- historical full text를 확보한 뒤에도 effective date와 previous-version relation을 먼저 확인한다.
- proposal 문구가 최종 시행본과 같다고 추정하지 않는다.
- 새로운 enacted epoch가 생기면 새 contract/run으로만 재평가한다.

## Related migrations / code paths

- `config/temporal-function-profile-v1.json`
- `tools/organizations/evaluate_temporal_function_profiles.py`
- `tools/organizations/check_temporal_function_profiles.mjs`
- `reports/measurements/2026-09-18-temporal-function-profile-v1/`
- `supabase/migrations/20260918000600_historical_organization_evidence_corpus.sql`
- `supabase/migrations/20260918000630_historical_organization_function_integrity.sql`

## Decision history

| Date | Decision |
|---|---|
| 2026-09-18 | 42개 T06.7 historical document를 모두 `PROPOSED_AMENDMENT`로 분류했다. |
| 2026-09-18 | proposal 42개를 enacted epoch로 승격하지 않았다. |
| 2026-09-18 | strict 683건을 temporal conflict가 아닌 no-profile로 분리했다. |
| 2026-09-18 | historical gold가 불완전해 calibration/holdout과 residual 적용을 보류했다. |
