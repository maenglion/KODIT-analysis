# KODIT Residual and Relation Ontology Workplan

## Status / 기준 commit

- Status: **T07-B TOPIC BOUNDARY/RECALL AUDITED; UI NOT STARTED**
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
T06.5 analytics meaning/grain hardening       완료
T06.6 historical org evidence/work attribution 완료
T06.7 official historical org evidence corpus/relationization 완료
T06.8 function-assignment positive control      완료; residual 적용 보류
T06.8.1 temporal gold/precision holdout          완료; AUTO_ACCEPT 불승인
T06.8.2 temporal function profile/as-of control  완료; historical 시행본 부재
T06.8.3 historical enacted organization corpus  완료; 2022~2025 시행 profile 추가
T06.8.4 selective high-precision resolution     완료; 표본 부족으로 AUTO_ACCEPT 불승인
T07-A topic analysis data layer               완료; topic-v1/read model/RPC
T07-B topic analysis UI                       아직 시작하지 않음
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

## T06.5 boundary

T06.5는 원장을 재작성하지 않고 channel evidence, canonical mention→notice relation,
RULE label→regulation identity, rule predicate, metric grain/date/release를 고정한다. T07의
모든 notice 통계는 distinct notice_id이며 분모는 current approved release 2,089 notices다.
`LINKED_TO_RULE` 3,775건을 proposal로 해석하지 않는다. `PROPOSES_CHANGE_TO`는 직접
title/body evidence만 허용하고 `FUNCTION_TRANSFERRED_TO`는 조직 승계 roll-up에서 제외한다.

## T06.6 boundary

T06.6의 primary grain은 T01 residual occurrence/notice다. 사람 이름이나 355개 lexical
label을 attribution key로 사용하지 않는다. 1,272개 notice work context와 audit run을
append-only로 보존하고 evidence-backed anchor notice에서 current/historical analog
candidate를 찾되, candidate similarity는 조직 귀속을 확정하지 않는다.

historical organization에서 current functional equivalent로 이동하는 경로는 공식
organization/function evidence만 허용한다. 기존 scoped `FUNCTION_TRANSFERRED_TO` 2건은
reified event로 추가 표현하지만 whole-organization succession으로 승격하지 않는다.
T07 UI와 topic analysis는 이 티켓에 포함하지 않는다.

## T06.7 boundary

T06.7은 공식 조직 근거문서의 series/version, snapshot, raw function observation과 공식
change evidence를 additive하게 보존한다. 사전예고와 snapshot diff는 공식 조직변경 event가
아니다. 같은 연도 공식 문서가 attribution run에 연결돼도 검색 입력일 뿐 확정 근거가
아니며, 공식 as-of/function/path가 없으면 `UNRESOLVED`를 유지한다. T07 UI는 시작하지 않는다.

## T06.8 boundary

T06.8은 exact-department 817건을 known-answer control로 삼되 담당부서와 조직/인물 표기를
입력에서 제거한다. strict subset 728건에서 coverage 92.03%, top-1 64.29%, top-3 83.38%로
측정되어 automatic attribution 계약으로는 불충분했다. residual 1,272건을 조회하거나
threshold 조정에 사용하지 않았으며 새 attribution version도 적용하지 않았다.

## T06.8.1 boundary

T06.8.1은 strict 728건을 current gold 27, historical-only gold 18, observed-only 683으로
분리했다. current gold를 SHA-256 stratified calibration 19 / holdout 8로 나누었고 overlap과
leakage는 0이다. calibration 5/5 규칙은 holdout 1/2(50%)로 실패했으므로 AUTO_ACCEPT와
residual 1,272건 versioned run을 생성하지 않았다. T07은 시작하지 않는다.

## T06.8.2 boundary

T06.7 historical 문서 42건은 모두 proposal이며 historical enacted full text, official effective
date, version-chain link는 각각 0이다. 따라서 strict 683건을 2026 profile과 비교하지 않고
`NO_MATCHING_TEMPORAL_PROFILE`로 분리해 temporal conflict를 0으로 만들었다. complete
multi-org gold는 current 27건뿐이고 historical 18건은 개인정보 기능 하나의 scoped partial
profile이므로 calibration/holdout과 residual 적용을 수행하지 않았다.

## T06.8.3 boundary

공식 ALIO 시행 archive에서 2022~2025 직제규정·본부점 세부운영기준·직무전결요령
31개 시행본을 보존하고 12개 temporal function profile epoch를 추가했다. proposal 42건은
별도 reconciliation 원장에 유지하며 시행본으로 승격하지 않는다. frozen scorer의 algorithm,
weights, threshold는 바꾸지 않았고 residual 1,272건에는 적용하지 않았다. 2012~2014 공식
시행본은 여전히 evidence gap이다.

## T06.8.4 boundary

698 complete multi-org gold를 2022~2024 calibration과 2025~2026 temporal holdout으로
분리하고 frozen retrieval 위에 공식 evidence gate만 평가했다. holdout union은 2/2였지만
최소 accepted N 30을 충족하지 못해 `AUTO_ACCEPT=false`다. residual 1,272건에는 새 run을
만들지 않았고 T07도 시작하지 않았다.

## T07-A boundary

T07-A는 current approved release 2,089 notices를 대상으로 소송과 투자·보증의 non-exclusive
`topic-v1` membership을 생성한다. notice grain은 항상 distinct notice_id다. TITLE_TERM,
MENTIONS_RULE, PROPOSES_CHANGE_TO, MENTIONS_WORK 근거를 분리 보존하고, LINKED_TO_RULE와
T06.x attribution/candidate/residual 추론은 기본 통계에 넣지 않는다. 직접 관측된 ORG mention이
확정 ORG_NODE로 해소된 경우만 조직 통계에 포함한다. public summary와 topic-notice drill-down
RPC까지가 범위이며 UI는 만들지 않았다.

## T07-B boundary

T07-B는 T07-A membership 39행/evidence 106행을 동결한 채 실제 의미 범위와 recall 후보만
감사한다. 직접 동일 regulation/proposal/work 누락은 0이며, 반복 title phrase 24건과 body-only
11건을 candidate/review artifact로 남겼다. 후보는 membership이 아니고 DB/RPC/UI를 바꾸지 않는다.
소송은 `SCOPE_CONFIRMED`, 투자·보증은 실제 구현 범위가 투자옵션부보증·보증연계투자 중심이라
`SCOPE_TOO_NARROW_FOR_NAME` 및 `NEEDS_MANUAL_BOUNDARY_DECISION`이다. T07 UI 또는 membership-v2는
사용자 경계 결정 전 시작하지 않는다.

## T07-C boundary

T07-C는 기존 topic-v1을 동결하고 투자·보증 parent를 승인된 공식 product/regulation child family의
union으로 구성한 `topic-membership-v2`를 별도 추가한다. generic `보증 OR 투자` 조건은 금지하고,
각 membership은 승인 family와 직접 evidence를 모두 가져야 한다. current release는 62건이며 v1
18건을 모두 포함하고 44건을 추가한다. LITIGATION은 topic-v1을 그대로 canonical로 참조한다.
신규 versioned read RPC까지만 제공하며 UI는 시작하지 않는다.

## Related architecture

- `docs/architecture/notice-department-residual-ledger.md` (T01 계약; 저장소에 아직 없음)
- `docs/architecture/document-extraction-ledger.md`
- `docs/architecture/observation-label-entity-model.md`
- `docs/architecture/topic-analysis-contract.md`
- `docs/architecture/historical-organization-work-attribution.md`
- `docs/architecture/organization-function-positive-control.md`
- `docs/architecture/organization-function-precision-gate.md`
- `docs/architecture/temporal-function-profiles.md`
- `docs/architecture/selective-function-resolution.md`

## Decision history

| Date | Ticket | Decision |
|---|---|---|
| 2026-09-17 | T01 | exact-match 실패 notice occurrence를 중립 residual로 보존한다. |
| 2026-09-17 | T02 | binary/parser/extraction provenance를 immutable ledger로 고정한다. |
| 2026-09-17 | T03 | extraction exact span mention을 observation으로 보존한다. |
| 2026-09-18 | T04 | lexical label과 type evidence를 집계하되 entity/node로 승격하지 않는다. |
| 2026-09-18 | T05 | 공식 근거가 있는 ORG label만 time-aware node로 승격하고 scoped function-transfer edge만 기록한다. |
| 2026-09-18 | T06 | 기존 occurrence/label/node 원장을 current-release public read model로 투영하고 두 CSV grain을 분리한다. |
| 2026-09-18 | T06.5 | T07 전에 source resolution, entity resolution, predicate, metric grain을 machine-readable 계약으로 고정한다. |
| 2026-09-18 | T06.6 | 1,272 residual notice 전부의 업무맥락·유사 후보·공식 조직근거·검색로그를 별도 append-only ledger로 보존하고 similarity-only 결과는 전부 미확정으로 유지한다. |
| 2026-09-18 | T06.7 | 42개 역사 조직 사전예고와 2026 current snapshot/function을 relationize하고 evidence-r2 rerun을 추가했으나 공식 path가 없어 1,272건 모두 미확정으로 유지한다. |
| 2026-09-18 | T06.8 | 817건 positive control에서 leakage 0을 확인했으나 top-1 64.29%여서 residual 승격을 보류한다. |
| 2026-09-18 | T06.8.1 | temporal gold를 분리하고 holdout precision을 측정했으나 50%로 95% AUTO_ACCEPT gate를 통과하지 못했다. |
| 2026-09-18 | T06.8.2 | 42개 historical proposal을 enacted profile과 분리하고 683건을 no-profile로 재분류했다. |
| 2026-09-18 | T06.8.3 | 31개 official enacted 문서와 12개 profile epoch를 추가하고 frozen scorer로 gold만 재평가했다. |
| 2026-09-18 | T06.8.4 | holdout 정밀도뿐 아니라 최소 표본 30건 gate를 적용해 AUTO_ACCEPT를 불승인했다. |
| 2026-09-19 | T07-A | 소송/투자·보증 topic-v1 membership, evidence, metric read model과 public-safe RPC를 추가하고 UI는 후속으로 분리했다. |
| 2026-09-19 | T07-B | topic-v1을 변경하지 않고 35개 false-negative 후보와 scope verdict를 재현 가능한 review artifact로 고정했다. |
| 2026-09-19 | T07-C | 투자·보증을 9개 승인 child family의 distinct union으로 구현하고 v1과 v2를 함께 재현 가능하게 보존했다. |
