# Historical Organization Evidence and Work-Path Attribution

## Status / 기준 commit

- Status: **T06.6 IMPLEMENTED AND REMOTE-VERIFIED**
- Parent checkpoint: `20feffd8311de27eedf5215a7c2c4718d8043daf`
- Contracts: `org-work-attribution-v1`, `org-work-similarity-v1`
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
후보만 존재하며 공식 시점별 조직·업무 근거가 부족해 전부 `UNRESOLVED`다. 3개 live
official page는 catalog URL 관측이고, 보존 binary/extraction이 없으므로
`parsed_text_available=false`다. 이는 0건 또는 파싱 실패를 뜻하지 않는다.

Context coverage는 binary 1,236/1,272, extraction 1,235/1,272, resolved regulation
779/1,272, direct proposal 910/1,272, work string 1,272/1,272다. 결측을 자동으로 사람이나
조직 의미로 치환하지 않는다.

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
- `config/org-work-similarity-v1.json`
- `tools/organizations/backfill_org_work_attribution.py`
- `tools/organizations/run_org_work_attribution_backfill.ps1`
- `tools/organizations/check_org_work_attribution_contract.mjs`
- `tools/organizations/verify_org_work_attribution.sql`
- `reports/measurements/2026-09-18-org-work-attribution/summary.json`

## Verification

- migration `20260918000500` applied to the linked production project
- first full backfill: PASS
- identical second full backfill: row counts unchanged
- SQL FK/count/residual-digest invariants: PASS
- anonymous HTTP catalog RPC: 200, 6 rows
- anonymous direct `core` access: blocked (HTTP 406)

## Decision history

| Date | Decision |
|---|---|
| 2026-09-18 | attribution subject는 person string이 아니라 residual notice의 work context다. |
| 2026-09-18 | T05 evidence-backed 조직 매핑만 anchor로 사용한다. |
| 2026-09-18 | 유사도는 후보 순위만 만들며 final attribution을 확정하지 않는다. |
| 2026-09-18 | 개인정보보호 담당 이동 2건을 reified FUNCTION_TRANSFER event와 direct function assignment로 추가 표현한다. |
| 2026-09-18 | 기존 T05 lineage edge는 보존하며 whole-organization succession으로 승격하지 않는다. |
| 2026-09-18 | 1,272건 전수 backfill 후에도 공식 path 근거가 부족한 결과는 `UNRESOLVED`로 유지한다. |
