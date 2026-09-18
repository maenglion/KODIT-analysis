# Historical Organization Evidence and Work-Path Attribution

## Status / 기준 commit

- Status: **T06.7 IMPLEMENTED AND REMOTE-VERIFIED — T07 NOT STARTED**
- Parent checkpoint: `d929af3949d8a19366009dd86142294b6f0a5ffe`
- Contracts: `org-work-attribution-v1`, `org-work-attribution-v1-evidence-r2`, `organization-document-version-v1`, `organization-snapshot-v1`, `organization-function-observation-v1`
- Evidence date: 2026-09-18

## Purpose

T01의 담당부서 미매핑 residual 1,272건을 사람 이름이 아니라 notice가 다루는 업무를
주어로 삼아 분석한다. 원 관측값은 수정하지 않고, 업무맥락·유사 notice 후보·공식
조직변경 근거·검색 과정과 결론을 append-only 감사 원장으로 분리한다.

## Current facts

- current approved release notices / residual occurrences: 2,089 / 1,272
- evidence-backed anchor notices: 862
- notice work contexts / attribution runs: 1,272 / 1,272
- candidate notices: 4,350
  - current analog candidates: 3,589
  - historical analog candidates: 761
- runs without a qualifying candidate: 193
- search/final steps: 3,816 (run당 3)
- attribution evidence links: 9,387
- official evidence catalog: 6 documents
  - 기존 extraction 원장을 재사용한 문서 3개
  - 공식 웹 URL 관측만 등록하고 parsed text로 승격하지 않은 문서 3개
- reified function-transfer events / direct function assignments: 2 / 2
- similarity로 확정된 attribution: 0
- T01 residual digest는 적용 전후 모두 `942718785d383b2a71a33d1c61a4c8df`다.

T06.7은 보존된 공식 조직 사전예고 중 KODIT 조직·직제·업무분장 series에 해당하는
42개 문서(2015~2026)를 신규 evidence catalog/version 원장에 추가했다. ACSIC 회의
조직위원회 문서 4개는 KODIT 조직구조 근거가 아니므로 제외했다. 현재 3개 전문과 합쳐
45 document version, 69 version-series relation이 존재한다. `previous_version_id`는 공식
대체 관계가 확인되지 않아 모두 비워 두었다.

2026 직제규정에서 current snapshot 1개와 조직 22개를 직접 관측했다. 함수 관측은
200개(직제규정 177, 본부점 세부운영기준 22, 직무전결요령 1)이며, 본부점 세부운영기준
22개 조직 block은 direct assignment로 연결했다. 개인정보보호 기능은 v3 계약에서
`리스크관리실 → 리스크준법실 → 안전전략실`의 비중첩 `[from,to)` epoch 3개로 고정한다.
초기 additive v2 privacy 행은 감사 이력으로만 남고 canonical read path에서 제외한다.

## Canonical sources

조직·업무 근거는 신용보증기금 공식 자료만 결론 근거로 사용한다.

- 보존 corpus의 `직제규정`
- 보존 corpus의 `직무전결요령`
- 보존 corpus의 `본부점 세부운영기준`
- 신용보증기금 공식 조직 안내
- 신용보증기금 공식 부서별 업무 및 연락처
- 신용보증기금 공식 개인정보 처리방침 변경이력

외부 기사·블로그·검색결과는 discovery 보조일 뿐 change event 또는 attribution을
확정하지 않는다. parsed text가 없는 공식 웹 catalog row는 URL 근거 관측이며, binary나
extraction이 존재하는 것처럼 표시하지 않는다.

## Data model / relation semantics

```text
RAW RESIDUAL / NOTICE
  └─ NOTICE_WORK_CONTEXT
       ├─ attachment binary SHA
       ├─ extraction IDs
       ├─ RULE / regulation / proposal evidence
       └─ person·email·raw department를 제외한 work strings

ORG_ANCHOR_NOTICE
  └─ T05의 evidence-backed label→node assessment만 사용

ATTRIBUTION_RUN
  ├─ ANALOG CANDIDATES
  ├─ SEARCH / FINAL STEPS
  ├─ EVIDENCE LINKS
  └─ optional official ORG/FUNCTION PATH
```

`CURRENT_ANALOG_CANDIDATE`와 `HISTORICAL_ANALOG_CANDIDATE`는 유사 notice 관측이다.
조직 귀속 또는 현재 기능상 대응 조직의 확정값이 아니다. `FUNCTION_TRANSFER`는
event scope에 적힌 기능 이동만 뜻하며 whole-organization succession이 아니다.

12개 `core` ledger는 append-only다. `analytics.org_work_attribution_audit`는
`security_invoker` 내부 감사 view다. `publish.public_organization_evidence_catalog()`은
향후 공개 `근거문서` 화면이 사용할 최소 catalog이며 개별 residual attribution을
공개하지 않는다.

T06.7 추가 계층은 다음과 같다.

```text
DOCUMENT_SERIES
  └─ DOCUMENT_VERSION
       ├─ EVIDENCE_SPAN
       ├─ ORG_SNAPSHOT → SNAPSHOT_OBSERVATION
       └─ FUNCTION_OBSERVATION → OFFICIAL FUNCTION_ASSIGNMENT

ATTRIBUTION v1
  └─ ATTRIBUTION evidence-r2
       └─ same-year official corpus documents (search input only)
```

같은 연도의 공식 조직문서가 rerun에 연결돼도 이는 검색 입력 이력일 뿐 책임조직 확정
근거가 아니다. `analytics.org_work_attribution_evidence_r2_audit`가 v1과 evidence-r2를
occurrence 단위로 비교한다. 1,219개 run이 같은 연도 공식 문서를 검색 입력으로 가졌지만,
공식 as-of snapshot/function/path가 없는 경우 상태를 올리지 않았다.

## Similarity contract

`config/org-work-similarity-v1.json`이 산식과 threshold를 고정한다. 입력 신호는 동일
binary, 동일 regulation, 동일 직접 proposal, title token Jaccard, 동일 body signature,
work-string Jaccard다.

- person signal weight = 0
- raw department signal weight = 0
- raw label, PERSON mention, EMAIL mention token은 work string에서 제외한다.
- exact evidence 신호가 title-only similarity보다 강하다.
- combined score는 candidate ranking 전용이며 resolved status를 만들지 않는다.

## Invariants

1. primary grain은 lexical label이 아니라 `release_id + residual_id + notice_id`다.
2. T01 residual row와 `notice_department` 원문을 수정하지 않는다.
3. 1,272 occurrence 각각에 정확히 한 work context와 한 v1 run이 존재한다.
4. candidate는 evidence-backed anchor notice만 참조한다.
5. 같은 run의 추론 결과를 다른 residual의 anchor로 재사용하지 않는다.
6. 유사 notice만으로 historical/current organization을 확정하지 않는다.
7. official event/evidence 없는 path step을 만들지 않는다.
8. `FUNCTION_TRANSFER`는 업무 scope가 확인될 때만 functional path에 사용할 수 있다.
9. 모든 object는 RLS/role 경계를 유지하며 core 직접 공개 조회는 금지한다.
10. deterministic UUID와 unique grain으로 동일 backfill 재실행은 no-op다.
11. evidence span·snapshot·function assignment의 document provenance는 서로 일치해야 한다.
12. historical preannouncement는 확정 snapshot/change event와 동일하지 않다.
13. 개인정보 기능 epoch의 canonical 계약은 v3이며 구간은 `[valid_from, valid_to)`다.

## Non-goals

- PERSON→ORG 소속·기안자·담당자 관계
- 사람 이름 또는 raw department 기반 similarity
- inferred attribution의 anchor 전파
- evidence 없는 rename/merge/split/succession
- T01~T06.5 원장 재작성
- T07 topic metric 또는 UI/GNB 구현
- 기존 public RPC 의미 변경

## Known gaps

193개 run은 v1 threshold를 넘는 evidence-backed analog candidate가 없다. 나머지 run도
후보만 존재하며 공식 시점별 조직·업무 근거가 부족해 evidence-r2도 전부 `UNRESOLVED`다. 3개 live
official page는 catalog URL 관측이고, 보존 binary/extraction이 없으므로
`parsed_text_available=false`다. 이는 0건 또는 파싱 실패를 뜻하지 않는다.

Context coverage는 binary 1,236/1,272, extraction 1,235/1,272, resolved regulation
779/1,272, direct proposal 910/1,272, work string 1,272/1,272다. 결측을 자동으로 사람이나
조직 의미로 치환하지 않는다.

역사 사전예고 coverage는 2015~2026에 존재하지만, 2012~2014에는 보존된 공식 조직
snapshot/function/change 근거가 없다. 따라서 해당 기간 14개 표본은 candidate가 있어도
모두 미해결이다. 2015~2025 문서도 대부분 개정 사전예고이며 완성된 연도별 snapshot이나
공식 from/to change event로 승격하지 않는다. temporal coverage는 2024·2026 개인정보
기능 event와 2026 current snapshot/function에 한정된다.

T06.8.3은 공식 ALIO 시행 archive에서 2022~2025 시행본 31개(직제규정 10,
본부점 세부운영기준 13, 직무전결요령 8)를 추가했다. 공식 시행일은 27개 문서에서
직접 확보했고, 본부점 세부운영기준의 시행일을 기준으로 12개 비중첩 temporal function
profile epoch와 1,357개 assignment를 만들었다. 전체 기능 본문은 assignment에 보존하고,
evidence span은 문서의 각 번호 항목 첫 줄과 실제 extraction 좌표를 보존한다.

42 proposal의 reconciliation 결과는 proposal 단위 `ENACTED_MATCHED` 16,
`NO_ENACTED_VERSION_FOUND` 26이다. proposal은 시행 evidence가 아니며, 매칭된 시행본도
proposal 문구와 동일하다고 추정하지 않는다. 2012~2014 시행본은 확보되지 않아 GAP이다.

Known-answer AS-OF gold는 function 45→698, complete multi-org 27→698로 증가했고,
`NO_MATCHING_TEMPORAL_PROFILE`은 683→119로 감소했다. frozen resolver를 그대로 재평가한
결과 coverage 625/698, top-1 482/698, top-3 614/698이었다. 이 측정은 residual 1,272건
자동 attribution 승인이 아니며 weights/threshold도 변경하지 않았다.

## Future cautions

- 공식 근거문서가 새로 확보되면 기존 row를 갱신하지 말고 새 evidence document/event를
  추가한다.
- historical org에서 current org로 이동할 때 similarity가 아니라 공식 change graph만
  사용한다.
- split/merge/function transfer는 업무 scope evidence 없이는 target을 선택하지 않는다.
- public evidence catalog의 SHA는 근거문서 artifact SHA이며 개별 규정 문서 provenance와
  다른 공개 예외다.

## Related migrations / code paths

- `supabase/migrations/20260918000500_org_work_attribution_ledger.sql`
- `supabase/migrations/20260918000510_org_work_attribution_integrity.sql`
- `supabase/migrations/20260918000600_historical_organization_evidence_corpus.sql`
- `supabase/migrations/20260918000610_historical_organization_evidence_backfill.sql`
- `supabase/migrations/20260918000620_historical_organization_evidence_attribution_audit.sql`
- `supabase/migrations/20260918000630_historical_organization_function_integrity.sql`
- `supabase/migrations/20260918000700_historical_enacted_org_corpus.sql`
- `config/historical-enacted-org-corpus-v1.json`
- `tools/organizations/backfill_historical_enacted_corpus.py`
- `tools/organizations/evaluate_historical_enacted_profiles.py`
- `reports/measurements/2026-09-18-historical-enacted-org-corpus-v1/`
- `reports/measurements/2026-09-18-historical-enacted-positive-control-v1/`
- `config/org-work-similarity-v1.json`
- `tools/organizations/backfill_org_work_attribution.py`
- `tools/organizations/run_org_work_attribution_backfill.ps1`
- `tools/organizations/check_org_work_attribution_contract.mjs`
- `tools/organizations/verify_org_work_attribution.sql`
- `tools/organizations/check_historical_org_evidence_contract.mjs`
- `tools/organizations/check_historical_org_evidence_http.mjs`
- `tools/organizations/verify_historical_org_evidence.sql`
- `reports/measurements/2026-09-18-org-work-attribution/summary.json`
- `reports/measurements/2026-09-18-historical-organization-evidence/summary.json`

## Verification

- migration `20260918000500` applied to the linked production project
- first full backfill: PASS
- identical second full backfill: row counts unchanged
- SQL FK/count/residual-digest invariants: PASS
- anonymous HTTP catalog RPC: 200, 6 rows
- anonymous direct `core` access: blocked (HTTP 406)
- migrations `20260918000600`~`20260918000630`: linked production applied
- historical official documents: 42/42 parsed; document versions / series links: 45 / 69
- current snapshot / organizations: 1 / 22
- function observations / detailed-rule assignments: 200 / 22
- evidence-r2 runs / resolved / official path: 1,272 / 0 / 0
- same-year official corpus audit links: 4,211; identical rerun row-count delta: 0
- public catalog/detail RPC: HTTP 200 / 200; catalog 48 rows
- anonymous direct `core` / `publish` table access: HTTP 406 / 401

## Decision history

| Date | Decision |
|---|---|
| 2026-09-18 | attribution subject는 person string이 아니라 residual notice의 work context다. |
| 2026-09-18 | T05 evidence-backed 조직 매핑만 anchor로 사용한다. |
| 2026-09-18 | 유사도는 후보 순위만 만들며 final attribution을 확정하지 않는다. |
| 2026-09-18 | 개인정보보호 담당 이동 2건을 reified FUNCTION_TRANSFER event와 direct function assignment로 추가 표현한다. |
| 2026-09-18 | 기존 T05 lineage edge는 보존하며 whole-organization succession으로 승격하지 않는다. |
| 2026-09-18 | 1,272건 전수 backfill 후에도 공식 path 근거가 부족한 결과는 `UNRESOLVED`로 유지한다. |
| 2026-09-18 | T06.7에서 보존 공식 corpus의 42개 KODIT 조직 관련 사전예고를 series/version 원장에 추가하고 ACSIC 4개를 제외했다. |
| 2026-09-18 | 같은 연도 공식 문서는 attribution 검색 입력으로만 연결하며 확정 근거로 승격하지 않는다. |
| 2026-09-18 | 2026 current snapshot/function을 관계화하고 개인정보 기능 epoch는 비중첩 v3 계약으로 고정했다. |
| 2026-09-18 | 2012~2014 공식 snapshot/function/change evidence gap 때문에 before/after resolved delta는 0이다. |
| 2026-09-18 | T06.8.3 공식 시행본만 temporal profile로 사용하고 proposal은 reconciliation 원장에 분리했다. |
| 2026-09-18 | 시행 profile 확대로 gold를 재계산하되 frozen resolver 계약과 residual 원장은 변경하지 않았다. |
