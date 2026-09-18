# Selective High-Precision Function Resolution

## Status / 기준 commit

- Status: **T06.8.4 EVALUATED; AUTO_ACCEPT NOT AUTHORIZED**
- Parent checkpoint: `02b5f99423024e658e52abd544c6707cccd0824f`

## Purpose

T06.8.3의 temporal function profile과 frozen retrieval을 유지하면서, 어떤 공식 evidence
조합만 자동 조직귀속에 사용할 수 있는지 precision-first 방식으로 평가한다. 전체 top-1
accuracy나 coverage를 높이는 작업이 아니다.

## Current facts

- complete multi-org gold: 698
- no matching temporal profile: 119
- calibration: 2022~2024
- holdout: 2025~2026
- notice overlap: 0
- regulation family overlap: 140
- normalized work family overlap: 3
- resolver input의 department 및 department-derived 값: 0

119건은 `ORG_NOT_IN_PROFILE` 48, `DATE_BOUNDARY_CONFLICT` 70,
`NOTICE_DEPARTMENT_IS_NOT_FUNCTION_OWNER` 1로 분해됐다. 마지막 1건만 direct official
function phrase가 게시 표기 부서와 다른 단일 조직을 지지한다. 이것을 사람 소속이나
작성 당시 조직으로 해석하지 않는다.

## Canonical sources

- T06.8.3 immutable temporal profiles and function assignments
- title/body/regulation/`PROPOSES_CHANGE_TO`/work evidence
- frozen T06.8.3 candidate ranking
- `config/selective-function-resolution-v1.json`

## Data model / relation semantics

Candidate ranking은 후보를 정하고 evidence gate는 자동확정 가능 여부를 정한다. 두 값을
하나의 score로 합치지 않는다. `CURRENT_FUNCTIONAL_ATTRIBUTION`은 현재 공식 구조에서 해당
업무를 담당한다고 검증된 규칙의 판단이며 historical as-of 조직이나 사람 소속이 아니다.

Function phrase audit 결과는 assignment 1,357, distinct atomic phrase 119, unique-org phrase
102, shared phrase 17, standalone generic phrase 0이다. generic lexicon은 versioned config로
보존하며 standalone evidence에서 제외한다.

## Invariants

- `notice_department`, raw department, known org ID, T01 exact/residual flag는 입력 금지다.
- 동일 문자열의 TITLE/BODY 반복을 독립 evidence 여러 개로 세지 않는다.
- similarity/title-only 규칙은 AUTO_ACCEPT할 수 없다.
- holdout 승인에는 observed precision 95% 이상과 accepted N 30 이상이 모두 필요하다.
- ambiguity는 정상 결과이며 임의 tie-break하지 않는다.
- current 결과를 historical field에 복사하지 않는다.

## Decision

Calibration에서 선택된 규칙의 holdout union은 2/2로 observed precision 100%였으나 Wilson
95% 구간은 34.24%~100%이고 accepted N=2다. 최소 30건 조건을 충족하지 못해
`AUTO_ACCEPT=false`다. residual 1,272건에는 새 attribution run을 만들지 않았다.

## Non-goals

- frozen scorer algorithm/weights/threshold 변경
- residual 1,272건 자동확정
- PERSON→ORG 관계
- 조직 변경/승계 추론
- T07 topic analysis 또는 UI

## Known gaps / future cautions

- strict function-owner gold가 4건뿐이므로 exact official phrase 기반 규칙을 일반화할 수 없다.
- regulation evidence가 있어도 top-1 accuracy는 약 70%이며 단독 확정 근거가 아니다.
- 119건 중 48건은 해당 epoch profile에 조직이 없고 70건은 profile 날짜 경계 밖이다.
- production AUTO_ACCEPT 재검토는 독립 holdout 표본 30건 이상을 확보한 새 contract에서 한다.

## Related code paths

- `config/selective-function-resolution-v1.json`
- `tools/organizations/evaluate_selective_function_resolution.py`
- `reports/measurements/2026-09-18-selective-function-resolution-v1/result.json`
- `docs/architecture/temporal-function-profiles.md`
- `docs/architecture/historical-organization-work-attribution.md`

## Decision history

| Date | Decision |
|---|---|
| 2026-09-18 | 119 mismatch를 official evidence로만 분류하고 설명되지 않는 의미를 추정하지 않는다. |
| 2026-09-18 | calibration 2022~2024와 temporal holdout 2025~2026을 분리한다. |
| 2026-09-18 | holdout 2/2는 최소 표본 30건을 못 채워 AUTO_ACCEPT를 승인하지 않는다. |
| 2026-09-18 | residual 적용 0건, T07 미시작으로 종료한다. |
