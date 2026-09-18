# Organization Function Precision Gate

## Status / 기준 commit

- Status: **T06.8.1 COMPLETE; T06.8.2 TEMPORAL PROFILE AUDIT COMPLETE; RESIDUAL NOT APPLIED**
- Parent checkpoint: `80506b352e2445c83def57ab3430498b9aba9741`
- Contract: `org-function-precision-gate-v1`

## Purpose

T06.8의 exact-department positive control을 시간 의미별 gold로 분리하고, calibration에서
고정한 규칙을 독립 holdout에서 한 번 검증하는 precision-first gate다. 목표는 모든 notice를
분류하는 것이 아니라 공식 근거가 충분한 일부만 자동확정할 수 있는지 검증하는 것이다.

## Current facts

- strict subset 728 = current-function gold 27 + historical-only gold 18 + observed-only 683
- current와 historical support가 동시에 존재하는 행: 23 (current gold에 우선 배치)
- 2026 current assignment를 과거 notice와 비교했던 행: 620
- current gold split: calibration 19 / holdout 8 / overlap 0
- calibration 95% 규칙: 5/5
- holdout 결과: 1/2, precision 50%, coverage 25%
- `AUTO_ACCEPT`: 승인 안 됨

817개 notice의 실제 범위는 2022~2026이다. 따라서 2012 notice는 이 positive-control corpus에
없으며, 2012~2014 historical evidence 탐색과 이번 current resolver 평가는 별개다.

## Canonical sources

- observed answer: current approved release의 exact `notice_department`
- current function gold: `analytics.canonical_organization_function_assignments`의 v2 valid window
- historical support: v3 assignment epoch 또는 공식 organization snapshot epoch
- prediction: frozen `org-function-positive-control-v4` 결과

## Data model / relation semantics

`notice_department`는 게시 당시 표시된 조직 관측값이다. 그것은 자동으로 현재 기능상
담당조직의 정답이 아니다.

```text
CURRENT_FUNCTION_GOLD
= notice date가 current official function assignment valid window 안에 있고
  observed department가 그 ORG_NODE로 공식 해소됨

HISTORICAL_ASOF_GOLD
= current gold는 아니지만 historical assignment/snapshot epoch가 게시시점 조직을 지지함

OBSERVED_DEPARTMENT_ONLY
= 부서 표기는 있으나 기능책임 gold로 쓸 temporal evidence가 없음
```

기존 64.29%는 `2026_PROFILE_OBSERVED_DEPARTMENT_REPRODUCTION_DIAGNOSTIC`이다.
`CURRENT_FUNCTION_ACCURACY`가 아니다.

## Invariants

1. calibration과 holdout은 SHA-256 notice-id split으로 고정하며 overlap은 0이다.
2. rule 선택과 threshold 결정에 holdout을 사용하지 않는다.
3. PERSON, raw department, residual label은 feature가 아니다.
4. residual 1,272건은 gate 통과 전 조회·튜닝·적용하지 않는다.
5. current resolver 결과를 historical organization 정답으로 재사용하지 않는다.
6. official regulation→function evidence가 없으므로 lexical regulation signal을 공식 relation으로 승격하지 않는다.

## Rule semantics

네 rule family를 사전 고정했다. calibration grid에서 목표 precision을 만족하는 최대 coverage
조합만 선택한다. 90/95/98/100% target 모두 calibration에서는 동일한
`REGULATION_TITLE_CORROBORATED` 규칙(5/5)을 선택했지만 holdout은 1/2였다.

따라서 자동확정은 0건이다. `CANDIDATE_ONLY`, `AMBIGUOUS`, `NO_MATCH`는 분석 결과일 뿐
운영 residual status로 적재하지 않았다.

## Phrase-grain audit

canonical 202행 중 coarse block 21개는 수정하지 않았다. T06.8 measurement의 137 atomic
profile을 사용했다. coarse 조직군과 비-coarse 조직군의 legacy top-1은 각각 63.98%,
65.13%로 모두 낮아 coarse block만이 오류의 단일 원인은 아니다.

atomic profile은 아직 운영 canonical assignment가 아니다. exact source span을 포함한
additive observation으로 승격하려면 별도 티켓과 provenance 검증이 필요하다.

## Non-goals

- residual 1,272건 versioned attribution run
- 기존 T06.7 run/candidate/evidence 변경
- historical resolver를 current resolver로 대체
- official evidence 없는 regulation→function relation
- T07 UI

## Known gaps

- current gold 27건, holdout 8건으로 조직별 표본이 작고 불균형하다.
- 4개 rule family 중 holdout에 도달한 것은 한 family뿐이다.
- ambiguous 162건 중 95건은 top-1 오답이며 official function phrase가 조직 간 중첩된다.
- regulation/proposal signal이 있는 strict row는 696건이지만 공식 regulation→function relation은 없다.

## Future cautions

- holdout을 보고 threshold를 재조정하면 새 contract와 새 holdout이 필요하다.
- historical evidence 확대 성과와 current-function resolver 성능을 한 metric으로 합치지 않는다.
- snapshot epoch는 조직 존재 support이며, 별도 function assignment 없이 기능책임을 증명하지 않는다.
- T06.8.2에서 historical 42건 모두 proposal로 확인됐다. enacted full text가 확보되기 전에는
  historical calibration/holdout을 만들지 않는다.

## Related migrations / code paths

- `config/org-function-precision-gate-v1.json`
- `tools/organizations/evaluate_org_function_precision_gate.py`
- `tools/organizations/check_org_function_precision_gate.mjs`
- `reports/measurements/2026-09-18-org-function-precision-gate-v1/`
- `supabase/migrations/20260918000630_historical_organization_function_integrity.sql`

## Decision history

| Date | Decision |
|---|---|
| 2026-09-18 | observed/as-of/current-function gold 의미를 분리했다. |
| 2026-09-18 | deterministic stratified calibration/holdout split을 고정했다. |
| 2026-09-18 | holdout precision 50%로 95% gate가 실패해 residual 적용을 중단했다. |
| 2026-09-18 | T06.8.2는 683건을 no-profile로 분리하고 historical enacted evidence gap을 고정했다. |
