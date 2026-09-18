# T06.8.1 gold separation and precision gate

## Population

```text
known answer                 817
strict subset                728
CURRENT_FUNCTION_GOLD         27
HISTORICAL_ASOF_GOLD          18
OBSERVED_DEPARTMENT_ONLY     683
```

Historical support total은 41건이며 이 중 23건은 current window와도 겹친다. 상호배타 gold
집계에서는 current를 우선하여 historical-only가 18건이다. strict 728 중 current assignment가
존재하지만 게시일이 그 2026 valid window 밖인 temporal conflict는 683건이다.

## Legacy metric

T06.8 top-1 468/728(64.29%)은 `2026_PROFILE_OBSERVED_DEPARTMENT_REPRODUCTION_DIAGNOSTIC`이다.
current-function accuracy가 아니다. corpus 기간은 2022~2026이며 2012 notice는 0건이다.

## Split and gate

- split: SHA-256 notice-id, organization-stratified v1
- calibration: 19
- holdout: 8
- overlap: 0
- leakage: 0

95% target calibration rule은 `REGULATION_TITLE_CORROBORATED` 5/5였다. holdout에서는 2건을
받아 1건만 맞았다(precision 50%, coverage 25%). 최소 holdout acceptance 5건도 충족하지
못했으므로 `AUTO_ACCEPT=false`다. residual 1,272건은 조회하거나 적용하지 않았다.

Current-function gold 자체의 frozen v4 diagnostic은 coverage 25/27(92.59%), top-1
17/27(62.96%), top-3 22/27(81.48%), ambiguous 7, no-candidate 2다. 조직별 confusion
matrix는 `result.json`에 보존했다.

## Other audits

- ambiguous: 162 = top-1 correct 67 + incorrect 95
- regulation/proposal backed strict subset: 696, top-1 455(65.37%), top-3 581
- official regulation→function relation: 없음; lexical signal을 official edge로 만들지 않음
- coarse canonical assignment: 21; 원본 수정 없음

조직 pair별 confusion, shared function bigram, 채널별 evidence presence와 전체 정책 결과는
`result.json`에 있다.
