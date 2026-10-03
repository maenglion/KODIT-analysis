# Work Trace Evidence Chain

## Status / 기준 commit

- Status: **REMOTE IMPLEMENTED + VALIDATED; PUBLIC STATIC PROJECTION VERIFIED**
- Base commit: `beb48a6010457bc44bef0b70d180a1449c046ee8`
- Contract: `work-trace-evidence-chain-v1`

## Purpose

이 원장은 과거 담당 표기의 정체나 최종 승계 조직을 판정하지 않는다. 사규예고, 개정 대상
규정, 업무 관측, 시기별 공식 업무분장과 조직변경 근거를 순서대로 연결해 확인된 지점까지
기록한다. 다음 관계를 확인할 수 없는 경우에는 빈 구간을 추정으로 메우지 않고, 체인이 멈춘
이유와 마지막 확인 시점 및 필요한 후속 자료를 남긴다.

잔차 분류는 추적 대상을 정리하기 위한 입력이다. 주된 산출은 업무 경로, 현재 업무분장 대응,
복수 대응, 증거사슬 단절과 자료 확충에 따른 경로 연장이다.

## Current facts

- current approved release notice: 2,089건
- exact canonical department match: 817건
- department residual occurrence: 1,272건 / distinct raw label 355개
- positive-control strict subset: 728건
- regulation/proposal signal을 가진 positive-control strict row: 696건
- approved regulation: 1,041건
- 공식 `FUNCTION_TRANSFERRED_TO`: 2건

696건은 residual 1,272건의 부분집합이 아니다. regulation→function 대조 계약을 검증하는
positive-control 자료이며 residual을 보고 기준을 조정하는 데 사용하지 않는다.

## Canonical sources

1. 사규예고: current approved `publish.notices`
2. 개정 대상 규정: `analytics.notice_rule_change_assertions`의 직접 `PROPOSES_CHANGE_TO`
3. 규정 identity/version: `core.regulations`, `core.regulation_versions`
4. 업무 관측: immutable extraction occurrence 또는 provenance를 가진 title/regulation observation
5. 공식 업무분장: `core.organization_function_assignments`
6. 공식 조직변경: `core.organization_change_events`와 공식 evidence document
7. 기능 이관: 기존 scoped `FUNCTION_TRANSFERRED_TO` 2건

current publish 1,041건의 `publish.regulations.regulation_id`는 `core.regulations.regulation_id`와 같은
identity가 아니다. 또한 publish의 1,041개 `regulation_version_id`는 현재 `core.regulation_versions`와
join되지 않는다. 따라서 공통 relation 원장은 다음 exact bridge로 core 규정 identity를 사용한다.

```text
publish.regulations.display_name
= core.regulations.canonical_name
```

2026-10-03 remote read-only preflight에서 1,041/1,041행이 정확히 하나의 core regulation에 연결됐고
0건이 미연결·복수연결이었다. 다만 이는 서로 독립적으로 수집한 두 규정 목록을 대조한 검증값이
아니다. `core.regulations`의 이름 모집단은 v0.4 regeneration의 `regulation_name`을
`canonical_name`으로 적재한 것이고, publish 모집단은 같은 v0.4 1,041행 CSV를 v0.5로 재평가한 뒤
v0.6 release로 투영한 것이다. 두 계층은 ID 체계와 책임이 다르지만 같은 상류 regulation corpus를
보존한다.

따라서 이 조인은 `SAME_UPSTREAM_CORPUS_EXACT_IDENTITY_RECONCILIATION`이다. 1,041/1,041은 두
materialization 사이에서 identity가 유실되거나 중복되지 않았다는 불변조건이지, 독립 출처 교차검증,
명칭 매칭 정확도 또는 규정→업무 관계의 정확도 지표가 아니다. publish version ID를 core version ID로
간주하지 않는다.

일반 `linked_regulation_version_ids` 3,775 occurrence는 `PROPOSES_CHANGE_TO`와 합치거나 proposal로
해석하지 않는다.

## 추정과 추적

추정은 중간 근거가 없는 상태에서 최종 조직을 정하는 것이다. 추적은 확인된 근거를 시간순으로
연결하고 더 이어 갈 수 없는 지점에서 멈춘 이유를 기록하는 것이다.

```text
사전예고
└─ PROPOSES_CHANGE_TO
   └─ 규정·업무 관측
      └─ 시기별 공식 업무분장
         └─ 공식 조직변경 또는 별도 현행 업무분장 관측
```

2018년 근거와 2026년 현행 업무분장이 각각 존재하더라도 중간 관계를 확인할 공식 근거가 없으면
하나의 연속 경로로 연결하지 않는다. 2026년 자료는 `별도 현행 관측`으로 남긴다.

시맨틱 비교는 다음 문서와 업무 문구를 찾는 조사 도구다. `FUNCTION_PHRASE_CANDIDATE`는
공식 이관 또는 조직 승계가 아니다.

## Stable identity

`trace_case_id`는 release와 독립한다.

```text
trace_case_id
= notice_id
+ regulation_id 또는 UNRESOLVED_REGULATION
+ stable work_observation_key
```

`work_observation_key`는 immutable extraction occurrence에 귀속된 mention ID 또는 동일한 provenance를
갖는 deterministic key여야 한다. release에서 다시 생성한 순번이나 화면 문자열은 사용할 수 없다.
`release_id`는 `trace_run`의 속성이다.

## Terminal outcomes

| terminal_outcome | 공개 표시 | 의미 | 조사자료 backlog |
|---|---|---|---|
| COMPLETE | 완료 범위에 따라 표시 | 현행 업무분장 또는 공식 이관 경로까지 확인 | 제외 |
| SOURCE_DOCUMENT_GAP | 자료 부재 | 다음 관계를 확인할 자료가 현재 확보 범위에 없음 | 포함 |
| RELATION_EVIDENCE_GAP | 연결 근거 부재 | 사전예고와 개정 대상 규정을 잇는 직접 근거가 없음 | 포함 |
| FUNCTION_CORRESPONDENCE_UNCONFIRMED | 대응 미확인 | 규정·업무는 확인됐으나 현행 업무분장 대응을 확인하지 못함 | 포함 |
| FUNCTION_MULTIPLE_CANDIDATES | 복수 대응 | 둘 이상의 현행 부서에 대응 문구가 확인됨 | 제외 |

`자료 부재`는 문서 또는 조직변경이 존재한다는 뜻이 아니다. 공개 설명은 "조직변경·업무이관을
확인할 수 있는 자료가 현재 확보 범위에 없다"로 쓴다.

`COMPLETE`는 다음 완료 범위를 반드시 가진다.

- `CURRENT_FUNCTION_OBSERVED`: 규정·업무와 현행 공식 업무분장의 관계까지 확인
- `OFFICIAL_TRANSFER_PATH_VERIFIED`: 공식 변경·이관 문서로 과거부터 현행까지 경로 확인

## Regulation → function relation ledger

`core.regulation_function_correspondences`는 규정과 현행 공식 업무분장 사이의 재사용 가능한
many-to-many 대조 원장이다. 이 원장은 규정마다 대표 부서 하나를 정하지 않는다. 동일 규정이
여러 function assignment에 직접 또는 후보로 대응할 수 있으며, 각 관계는 규정 근거와 업무분장
근거를 각각 참조한다.

- `FUNCTION_DIRECT`: 공식 업무분장에 규정명과 함께 관리·제정·개정·폐지·유권해석 같은 담당 행위가
  명시된 경우. `직제규정상 분담직무` 같은 표 머리글의 단순 반복은 제외한다.
- `FUNCTION_PHRASE_CANDIDATE`: 고정된 비교 계약으로 찾은 조사 후보. 공식 담당 확정이나 조직 승계가 아님

초기 `work-trace-regulation-function-v1`은 규정명과 규정 전문을 입력으로 사용한다. `notice_department`,
잔차 raw label, PERSON/ORG/EMAIL mention은 relation builder 입력에서 제외한다. exact department 817건은
relation을 모두 만든 뒤에만 대조하며, 그 결과는
`OBSERVED_DEPARTMENT_REPRODUCTION_DIAGNOSTIC`으로 기록한다. 이 값은 현행 function owner accuracy가
아니다. 과거 게시부서와 현행 업무 소관이 다를 수 있다는 것이 이번 추적 모델의 전제이기 때문이다.

`work_trace_function_correspondences`는 이 공통 relation을 해당 notice branch에서 사용했다는
사실을 남긴다. 따라서 같은 규정 관계를 notice마다 새 판정으로 만들지 않는다.

2026-10-03 read-only preflight 결과는 다음과 같다.

- canonical function assignment grain: 202행 / 23 org node / 공식 문서 3건
- `work_string` 길이: 최소 4자 / 중앙값 17자 / p90 258.6자 / 최대 500자 / 1,000자 이상 0건
- 공식 관리 행위 문구가 직접 확인된 relation: 10개 규정 / 10개 relation / 규정당 조직 1개
- phrase candidate: 530개 규정 / 984개 relation
- direct 또는 candidate가 없는 규정: 503개
- positive-control 696행 중 relation/candidate coverage: 403행
- 이 diagnostic은 관측 게시부서 포함 여부만 재현하며 현재 function owner accuracy가 아니다.

`직제규정상 분담직무`처럼 공식 업무분장 표에 반복되는 머리글은 direct 근거로 사용하지 않는다.
direct는 규정명 뒤에 관리·제정·개정·폐지·유권해석 같은 담당 행위가 명시된
`EXACT_REGULATION_MANAGEMENT_REFERENCE`만 허용한다.

## Correspondence basis

복수 대응의 각 endpoint는 근거 강도를 별도로 가진다.

- `FUNCTION_DIRECT`: 공식 업무분장에 규정명 또는 해당 업무가 직접 명시됨
- `FUNCTION_PHRASE_CANDIDATE`: 관측 업무 문구와 현행 업무분장 문구를 대조한 조사 후보

후보가 여러 개여도 대표 부서 하나를 선택하지 않는다. 동일한 조직에 두 basis가 함께 있으면
endpoint는 하나로 유지하고 `FUNCTION_DIRECT`를 주 근거로 하며 모든 evidence citation을 남긴다.

## Versioned runs and corrections

자료가 추가되면 새 run을 생성한다. 이전 run과 branch result는 UPDATE/DELETE하지 않는다.
run에는 release, contract version, evidence corpus digest, evidence cutoff와 추가 evidence 관계를
남긴다.

digest는 동일성 검사용이다. 자료 확충 효과는 run에 추가된 evidence reference와 새 단계가 실제로
인용한 reference를 대조해 측정한다. 여러 문서가 함께 추가되면 문서 하나의 단독 효과로 쓰지 않는다.

이전보다 경로가 짧아진 경우에는 append-only correction relation을 만든다. 이전 result를 읽는
read model은 후속 정정의 존재와 superseding result를 함께 알려야 한다.

실행 간 기본 변화는 서로 배타적이다.

- `EXTENDED`
- `COMPLETED`
- `OUTCOME_CHANGED`
- `SHORTENED_CORRECTION`
- `UNCHANGED`

`evidence_added`, `became_multiple_correspondence`, `completion_scope_changed`,
`official_path_added`는 별도 부가 속성이다. 새 case와 비교 대상에서 빠진 case는 각각
`ADDED_CASE`, `OUT_OF_SCOPE_CASE` population change로 분리한다.

## Public boundary

PERSON 공개 객체에는 조직·부서·직무·이동·후보·경로 필드를 넣지 않는다. PERSON 화면은 승인된
별칭과 관측 게시물까지만 제공한다. 업무 추적은 `notice_id` 중심 별도 read contract이며 PERSON
별칭을 반환하지 않는다. 현재 부서 축도 PERSON 별칭을 나열하지 않는다.

```text
금지: 이 사람의 현재 부서
허용: 이 사전예고가 다룬 업무의 현행 업무분장 대조
```

새 core/analytics 원장은 service-role 전용이다. 익명 core 접근이나 PERSON/ORG 혼합 public RPC를
추가하지 않는다. 공개 payload는 별도 보안 검토를 통과한 trusted exporter의 최소 snapshot으로
추가한다.

적재는 `api.record_work_trace_*` service-only writer를 사용한다. 이는 익명 공개 read RPC가 아니라
기존 collector/publisher와 같은 trusted writer 경계다. evidence, 공통 regulation→function relation,
run header, branch batch와 backlog를 나누어 idempotent하게 적재한 뒤
`api.finalize_work_trace_run()`이 전체 invariant를 통과한 run에 validation row를 남긴다. 중간 실패로
일부 row가 적재되어도 validation이 없으므로 승인된 trace run으로 읽지 않으며, 같은 deterministic ID로
재실행해 이어서 적재할 수 있다.

## Invariants

1. `trace_case_id`에 `release_id`를 사용하지 않는다.
2. 표시된 모든 연결 단계는 근거번호와 evidence reference를 가진다.
3. 근거가 없는 기간을 건너뛴 연속 경로는 0건이다.
4. gap outcome은 break detail을 정확히 하나 가진다.
5. `COMPLETE`는 completion scope를 정확히 하나 가진다.
6. `FUNCTION_MULTIPLE_CANDIDATES`는 distinct current org endpoint가 2개 이상이며 backlog에서 제외한다.
7. 동일 run과 trace case에 서로 배타적인 terminal outcome을 둘 이상 두지 않는다.
8. 동일 notice의 서로 다른 regulation/work branch는 서로 다른 outcome을 가질 수 있다.
9. `last_verified_date`는 `gap_from`보다 뒤일 수 없다.
10. 과거보다 짧아진 branch는 correction relation과 정정 근거를 가진다.
11. 이전 run/result는 수정하거나 삭제하지 않는다.
12. contract version이 다른 run을 evidence 확충 효과로 합산하지 않는다.
13. `FUNCTION_PHRASE_CANDIDATE`를 공식 이관·조직승계로 표시하지 않는다.
14. PERSON→ORG 공개 relation은 0건을 유지한다.
15. 기존 `FUNCTION_TRANSFERRED_TO` 2건은 관측 endpoint와 합산하지 않는다.
16. 기존 residual, mention, label, org node와 regulation ID를 재생성하지 않는다.
17. regulation→function 관계는 many-to-many로 보존하고 대표 조직 하나로 축약하지 않는다.
18. 모든 regulation→function 관계는 규정 근거와 function assignment 근거를 각각 가진다.
19. publish regulation ID를 core regulation ID로 사용하지 않는다. exact name bridge는 1:1 invariant를
    통과해야 한다.
20. `linked_regulation_version_ids`를 `PROPOSES_CHANGE_TO`로 해석하지 않는다.

## Non-goals

- 잔차의 PERSON/ORG/OTHER 분류 개선
- 사람의 소속·기안자·업무담당자 판정
- 최고 유사도 조직의 자동확정
- 공식 근거 없는 rename/merge/split/succession
- 기존 attribution run/result rewrite
- 검증·승인 전 1,272건 운영 backfill
- UI 구현

## Known gaps

- relation과 trace run은 운영 append-only 원장에 적재·검증했고 public-safe A/B/C projection과
  checked-in snapshot을 생성했다. Manus UI와 공개 배포는 아직 적용하지 않았다.
- core regulation identity 1,041건에는 version ledger가 1건만 존재한다. publish version identity를 core
  version으로 오인하지 않으며, version별 추적은 별도 정본 보강이 필요하다.
- positive-control strict row 696건은 evaluation material이며 운영 relation 원장이 아니다.
- work observation identity가 extraction mention이 아닌 title/regulation observation인 경우 안정적인
  provenance key는 현재 direct assertion ID를 사용한다. 본문 WORK occurrence를 branch grain에 추가하는
  것은 후속 계약이다.
- 공개 A/B/C payload와 친절한 데이터 리터러시는 core invariant 검증 이후 별도 계약으로 고정한다.

## Validated residual trace run

`work-trace-run-v1`은 current residual 1,272건을 다음처럼 닫았다. 같은 deterministic plan을
운영 append-only 원장에 적재하고 `api.finalize_work_trace_run()` 검증까지 통과했다.

| outcome | branch 수 | 해석 |
|---|---:|---|
| COMPLETE / CURRENT_FUNCTION_OBSERVED | 38 | 직접 관리 문구로 현행 업무분장까지 확인 |
| FUNCTION_MULTIPLE_CANDIDATES | 222 | phrase candidate가 2개 이상이며 대표 조직을 선택하지 않음 |
| FUNCTION_CORRESPONDENCE_UNCONFIRMED | 650 | 직접 대응 없음; 219건은 단일 phrase candidate, 431건은 candidate 없음 |
| RELATION_EVIDENCE_GAP | 362 | direct `PROPOSES_CHANGE_TO` 없음 |

endpoint width는 0개 793건, 1개 257건, 2개 104건, 3개 118건이다. 2·3개 endpoint는
`FUNCTION_PHRASE_CANDIDATE`이며 공식 이관이나 업무 분산 확정으로 쓰지 않는다. direct relation이 있는
38건만 `COMPLETE`다. planner는 `notice_department`, raw label, PERSON identifier와 일반
`linked_regulation_version_ids`를 읽지 않았다.

38건은 residual occurrence 1,272건 중 현재 확보한 공식 업무분장에 규정 관리 문구가 직접 나타나
현행 업무 관측까지 이어진 하한 2.99%다. 규정 모집단 기준으로는 1,041개 중 10개 규정에 direct
relation이 있어 0.96%이며, 두 분모를 합치지 않는다. 이 값은 정답률이나 기관 전체 기록의 부존재를
뜻하지 않는다. 현재 확보한 공식 업무분장 202행·공식 문서 3건에서 직접 입증된 범위다.

`FUNCTION_CORRESPONDENCE_UNCONFIRMED` 650건 중 219건은 단일 phrase candidate가 있었지만 direct
근거가 아니므로 완료로 올리지 않은 의도적 보류다. `RELATION_EVIDENCE_GAP` 362건은 현재의 엄격한
title-direct `PROPOSES_CHANGE_TO` assertion 계약으로 개정 대상 규정을 확인하지 못한 건수다. 규정
관련 문자열·일반 linkage가 전혀 없다는 뜻으로 확대 해석하지 않는다.

## Verification

- 격리 PostgreSQL 18에서 기존 schema migration 28개와 신규 work-trace migration 2개를 적용했다.
- schema validator, append-only/idempotent service writer, gap/multiple/correction/run-delta SQL test가 통과했다.
- offline plan invariant 검사와 Python syntax 검사가 통과했다.
- 동일 원격 정본을 두 번 읽어 생성한 relation plan과 trace plan의 파일 SHA가 각각 동일했다.
- deterministic `trace_run_id`: `a00dba9a-4f99-2ece-ce53-35fc87afc433`
- applied relation plan SHA-256: `296391727ea9ddbbd11921da2e3fc8bf0404349890878ba10e0cdf39002f1e87`
- applied trace plan SHA-256: `3f11734a529cd9527d03e1cd2ae1e004ead3da9eae346022f40ccd925ce7b9d2`
- remote migration: `20261003000300`, `20261003000310`
- 최초 적재: relation evidence 1,243 / relation 994 / notice evidence 신규 1,272 / run 1 /
  branch result 1,272 / evidence need 677 / validated branch 1,272
- 원격 원장: trace case 1,272 / step 3,001 / evidence link 3,820 / evidence reference 2,515 /
  research backlog 영향 branch 1,012
- 동일 run 재실행: relation/evidence/run/result/need insert delta 전부 0 / validated branch 1,272
- writer EXECUTE: `anon=false`, `authenticated=false`, `service_role=true`
- core direct SELECT: `anon=false`, `authenticated=false`; public work-trace function 0개
- T01 residual digest `942718785d383b2a71a33d1c61a4c8df`, current notice 2,089,
  regulation 1,041, notice↔regulation occurrence 3,775, mention 20,937, label 2,209,
  organization node 27, lineage edge 2가 유지됐다.

첫 trace apply는 plan 생성 중 재사용 relation 객체에 branch 전용 `trace_step_id`를 덧붙이는 client-side
mutation 때문에 idempotency check에서 중단됐다. run/result/validation 잔존은 0건이었다. relation row를
복사한 뒤 branch metadata를 붙이도록 고쳤고, 같은 relation plan을 다시 보내도 insert delta 0으로
통과하는 회귀검사를 추가했다. 기존 DB row를 수정하거나 삭제하지 않았다.

기존 T06.6/T06.7 verifier의 evidence-document/version 고정 count는 후속 T06.7/T06.8.3 확장을 반영하지
못해 각각 6→37, 45→76에서 중단된다. protected count와 residual digest는 현재 정본을 직접 대조했다.

## Related migrations / code paths

- `supabase/migrations/20261003000300_work_trace_evidence_chain.sql`
- `supabase/migrations/20261003000310_work_trace_service_writer.sql`
- `config/work-trace-regulation-function-v1.json`
- `config/work-trace-run-v1.json`
- `tools/organizations/build_regulation_function_correspondence.py`
- `tools/organizations/build_work_trace_run.py`
- `tools/organizations/check_work_trace_evidence_chain_contract.mjs`
- `tools/organizations/check_work_trace_run_plan.mjs`
- `tools/organizations/verify_work_trace_evidence_chain.sql`
- `tools/publish/build_work_trace_public_snapshot.mjs`
- `tools/publish/check_work_trace_public_snapshot.mjs`
- `apps/public-site/data/public-work-trace-v1.json.gz`
- `apps/public-site/lib/work-trace-data.ts`
- `supabase/migrations/20260918000500_org_work_attribution_ledger.sql`
- `docs/architecture/organization-function-precision-gate.md`

## Decision history

| Date | Decision |
|---|---|
| 2026-10-03 | 잔차 분류를 산출로 삼지 않고 notice/regulation/work의 증거사슬 추적으로 전환했다. |
| 2026-10-03 | release-independent trace case, append-only run, evidence citation과 correction relation을 채택했다. |
| 2026-10-03 | 자료 부재·연결 근거 부재·대응 미확인과 복수 대응을 분리했다. 복수 대응은 backlog가 아닌 산출이다. |
| 2026-10-03 | PERSON 공개 계약과 업무 추적 계약을 분리하고 PERSON→ORG 공개 결합을 계속 금지했다. |
| 2026-10-03 | publish/core 규정 ID가 다름을 확인하고 1,041/1,041 exact-name 1:1 identity bridge를 고정했다. 이 수치는 동일 상류 corpus의 materialization reconciliation이며 독립 출처 검증값이 아니다. |
| 2026-10-03 | 표 머리글 반복을 direct에서 제외하고 명시적 규정 관리 행위 문구만 direct로 인정했다. |
| 2026-10-03 | 1,272건 dry-run을 생성했으나 운영 migration/backfill은 적용하지 않았다. |
| 2026-10-04 | additive migration 2개와 deterministic relation/trace plan을 운영 원장에 적용하고 1,272 branch를 검증했다. |
| 2026-10-04 | trace planning이 relation payload를 mutation하던 결함을 발견해 복사 경계를 추가하고 idempotent 재실행 delta 0을 확인했다. |
| 2026-10-04 | public runtime RPC 대신 validated run에서 생성한 정적 A/B/C snapshot을 채택하고 PERSON·raw label·internal identity를 payload에서 제외했다. |

> 추적은 답을 만들어 내는 일이 아니라, 확인된 근거를 순서대로 연결하고 더 이어 갈 수 없는
> 지점에서 멈춘 이유를 기록하는 일이다. 각 단계에는 근거번호와 원문 링크를 붙이며, 끊긴 지점의
> 목록은 다음 조사자가 확보해야 할 자료 목록으로 사용한다.
