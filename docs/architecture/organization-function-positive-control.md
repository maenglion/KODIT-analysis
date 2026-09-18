# Organization Function Positive Control

## Status / 기준 commit

- Status: **T06.8 POSITIVE CONTROL COMPLETE; RESIDUAL PROMOTION NOT AUTHORIZED**
- Parent checkpoint: `3eb30af9b5a987fa4ae97d50aa217128b4871298`
- Contract measured: `org-function-positive-control-v4`

## Purpose

T01 exact-department notice 817건을 known-answer positive control로 사용해 담당부서 값을
입력에서 숨긴 상태에서 공식 function assignment만으로 조직을 재현할 수 있는지 측정한다.
이 검증은 residual 1,272건을 보기 전에 수행하며, 성능이 검증되지 않은 계약을 residual에
승격하지 않도록 하는 gate다.

## Current facts

- known answers: 817
- strict evaluable subset: 728
- leakage: 0
- canonical assignments: 202
- numbered atomic profiles used by scorer: 134 + temporal 3
- coverage: 670 / 728 (92.03%)
- top-1 accuracy: 468 / 728 (64.29%)
- top-3 recall: 607 / 728 (83.38%)
- ambiguous: 162
- no candidate: 58

85건은 정답 조직에 current atomic function assignment가 없고, 4건은 제목 외 신호가 없어
strict subset에서 제외됐다.

## Canonical sources

- answer population: current approved release의 v0.6 canonical exact-department notices
- function source: `analytics.canonical_organization_function_assignments`
- detailed function text: 2026 `본부점 세부운영기준` 별표3 extraction
- notice evidence: title/body, resolved regulation identity, direct proposal assertion, WORK mention

정답 `notice_department`는 evaluation label로만 사용하며 scorer 입력에는 들어가지 않는다.

## Data model / relation semantics

원 202개 assignment는 보존한다. 21개 200자 초과 조직 블록을 그대로 하나의 phrase로
취급하지 않고, 별표3의 실제 `부서명+1.` heading을 기준으로 22개 조직 block을 다시 잡고
각 block의 연속 번호 직무 134개를 observation profile로 사용한다.

이 profile은 T06.8 measurement artifact이며 아직 운영 DB의 새 canonical assignment가 아니다.
candidate score는 조직 귀속 확정이나 official path를 뜻하지 않는다.

## Invariants

1. feature payload에는 `notice_department`, residual raw label, PERSON/ORG/EMAIL mention이 없다.
2. 모든 알려진 조직명은 scorer text에서 제거한다.
3. 정답은 모든 prediction 생성 후에만 join한다.
4. positive-control 중 residual 1,272건을 조회하지 않는다.
5. T06.7 run/candidate/evidence는 수정하지 않는다.
6. top-k similarity만으로 조직 attribution을 확정하지 않는다.

## Non-goals

- residual 1,272건 새 version backfill
- threshold를 residual 결과로 조정
- T06.7 원장 rewrite
- PERSON→ORG 관계
- 새 organization lineage/change event
- T07 UI

## Known gaps

top-1 64.29%와 top-3 83.38%는 automatic attribution 계약으로 충분하지 않다. 특히 조직별
confusion 편차가 크고, canonical exact label 중 4개 조직 85건은 current atomic profile이
없다. 따라서 v4는 residual promotion gate를 통과하지 못했다.

## Future cautions

- residual을 먼저 보고 weight/threshold를 조정하면 known-answer gate가 오염된다.
- 조직명이나 legacy owning-department 필드를 feature로 넣으면 label leakage다.
- current 2026 function assignment가 과거 notice의 당시 담당조직을 소급 증명하지 않는다.
- 다음 버전은 새로운 config/evaluator/report hash로 append하고 v4 artifact를 덮어쓰지 않는다.

## Related migrations / code paths

- `config/org-function-positive-control-v4.json`
- `tools/organizations/evaluate_org_function_positive_control.py`
- `tools/organizations/check_org_function_positive_control.mjs`
- `reports/measurements/2026-09-18-org-function-positive-control-v4/`
- `supabase/migrations/20260918000630_historical_organization_function_integrity.sql`

## Decision history

| Date | Decision |
|---|---|
| 2026-09-18 | exact-department 817건을 residual보다 먼저 평가한다. |
| 2026-09-18 | 조직명 첫 출현 대신 `부서명+1.` heading으로 별표3 block을 경계한다. |
| 2026-09-18 | 134개 번호 직무와 3개 temporal assignment를 scorer profile로 사용한다. |
| 2026-09-18 | v4 성능은 automatic attribution에 부족하므로 residual 적용을 보류한다. |
