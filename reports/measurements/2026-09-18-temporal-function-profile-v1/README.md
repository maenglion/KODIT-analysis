# T06.8.2 temporal function profiles

## Official-document classification

```text
T06.7 historical documents  42
PROPOSED_AMENDMENT           42
historical enacted fulltext   0
official effective date       0
version-chain links            0
```

현재 catalog 전체 47건은 enacted fulltext 1, function assignment 1, delegation rule 1,
organization chart 1, proposal 42, unclassified contact page 1이다. proposal을 시행 profile로
승격한 행은 0건이다.

## As-of gold

```text
known answers                         817
strict subset                         728
ASOF_DEPARTMENT_GOLD                   23
ASOF_FUNCTION_GOLD total               45
  complete multi-org                   27
  scoped privacy-function              18
strict NO_MATCHING_TEMPORAL_PROFILE   683
temporal conflict after filter           0
```

## Complete multi-org result

- coverage: 24/27 (88.89%)
- top-1: 17/27 (62.96%)
- top-3: 22/27 (81.48%)
- ambiguous: 7
- no-match: 3
- non-ambiguous accepted precision: 12/17 (70.59%)

Historical scoped profile 18건은 개인정보 기능 하나만 존재하므로 multiclass accuracy로
해석하지 않는다. coverage는 3/18이다.

## Gate

Historical complete multi-org epoch가 0이므로 calibration/holdout을 실행하지 않았다.
`AUTO_ACCEPT=false`, residual run 생성 0, T07 변경 0이다.
