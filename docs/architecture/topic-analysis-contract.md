# Topic Analysis Number Contract

## Status / 기준 commit

- Status: **T06.5 IMPLEMENTED — T07 READINESS CONTRACT**
- Parent checkpoint: `715122af204a71d82119d47b37387da944625e1f`
- Contracts: `mention-notice-v1`, `rule-label-regulation-v1`, `change-assertion-v1`, `topic-metrics-v1`

## Purpose

T07에 앞서 관측, source resolution, entity resolution, predicate, metric grain을 분리한다.
이 문서는 topic을 분류하지 않으며 숫자가 무엇을 세는지만 고정한다.

```text
같은 extraction ≠ 같은 notice
같은 RULE mention ≠ 같은 regulation version
MENTIONS_RULE ≠ LINKED_TO_RULE ≠ PROPOSES_CHANGE_TO
mention occurrence count ≠ notice count
```

## Canonical sources

- notice 모집단과 source date: current approved `publish.notices`
- lexical mention: `core.extraction_mentions`
- mention→notice: `analytics.mention_notice_resolution`
- RULE label→regulation: `analytics.rule_label_resolution`
- proposal assertion: `analytics.notice_rule_change_assertions`
- metric contract: `config/topic-analysis-metrics-v1.json`
- predicate contract: `config/analysis-predicates-v1.json`
- runtime/Unicode metadata: `config/analysis-contract-runtime-v1.json`

`analytics` 객체는 security-invoker derived read model이다. 원 source snapshot이 immutable한
release/ledger이므로 결과가 결정적이며 별도 복제 row의 stale 위험을 만들지 않는다.

## Evidence channels

`analytics.label_channel_evidence`는 다음 채널을 섞지 않는다.

```text
DEPT_STRING_OBSERVATION
MENTION_PERSON
MENTION_ORG
MENTION_RULE
MENTION_WORK
MENTION_EMAIL
```

T01 department string은 PERSON/ORG type evidence가 아니다. 동일 lexical label이 다른
문서 본문에서 관측된 경우에만 해당 mention channel count가 생긴다.

## Mention → notice resolution

`mention-notice-v1`은 KODIT 보존 source record의 `external_key`와 release notice의
`notice_number`를 결합한다. 동일 binary가 같은 notice로 중복 확장된 경우는
`(release_id, mention_id, notice_id)`로 한 번만 센다. 실제 두 notice가 binary를 재사용하면
두 관계를 유지한다.

Current approved release 실측:

- relation rows: 14,417
- unique mentions with notice: 14,349
- multiple-notice mentions: 68 (각 2 notices)
- KODIT-source unresolved: 0
- ALIO-only/non-notice mentions: 6,588
- source-less mentions: 0

T07 notice metric은 항상 `COUNT(DISTINCT notice_id)`다.

## RULE label → regulation

`core.regulations.canonical_name`은 현재 1,041개 regulation identity에서 unique하다.
`rule-label-regulation-v1`은 exact canonical name으로 759/759 RULE labels를 regulation_id에
연결한다. ambiguous/unresolved는 각각 0이다. 이름만으로 regulation_version_id를 확정하지
않는다.

## Predicate registry

- `MENTIONS_RULE`: extraction의 exact RULE span을 regulation identity로 해소한 관측
- `LINKED_TO_RULE`: publish projection의 notice→regulation_version 연결
- `PROPOSES_CHANGE_TO`: direct title/body evidence가 있는 제정·개정·폐지 assertion
- `FUNCTION_TRANSFERRED_TO`: 특정 기능 담당 이동; 조직 승계가 아님

Current `LINKED_TO_RULE` grain은 `(release_id, notice_id, regulation_version_id)`이며 current
release에 3,775개, duplicate pair 0이다. 이를 proposal metric에 사용하지 않는다.

`change-assertion-v1`의 현재 backfill/read model은 고정된 제목 규칙의 `TITLE_DIRECT`만
허용한다. canonical name이 명시적으로 인용되거나 제목 처음에 정확히 나타나고, 한 notice의
후보 regulation과 change cue가 각각 하나로 결정되는 경우만 포함한다. 불확실한 다중 후보와
cue 충돌은 assertion 0으로 남긴다. target regulation version은 추측하지 않고 NULL이다.

## Metric registry

| Metric | Primary grain | Date | Release | Predicate |
|---|---|---|---|---|
| TOPIC_NOTICE_COUNT | DISTINCT notice_id | posted_date | current approved | pending T07 topic membership |
| TOPIC_NOTICE_YEAR_TREND | DISTINCT notice_id by posted year | posted_date | current approved | pending T07 topic membership |
| TOPIC_REGULATION_COUNT | DISTINCT regulation_id | posted_date | current approved | MENTIONS_RULE |
| MOST_MENTIONED_REGULATIONS | regulation_id → DISTINCT notice_id | posted_date | current approved | MENTIONS_RULE |
| MOST_PROPOSED_CHANGE_REGULATIONS | regulation_id → DISTINCT notice_id | posted_date | current approved | PROPOSES_CHANGE_TO |
| TOP_ORGANIZATIONS | resolved org_node_id → DISTINCT notice_id | posted_date | current approved | MENTION_ORG_AS_OF |
| WORK_KEYWORDS | WORK label → DISTINCT notice_id | posted_date | current approved | MENTION_WORK |

기본 notice 비율 분모는 같은 current approved release의 2,089 distinct notices다. 연도별
추이는 historical release 비교가 아니라 현재 corpus 안 `posted_date` 연도다. WORK는
7개 closed lexicon이므로 UI 명칭은 `선정 업무 키워드`다.

## Organization inclusion and temporal rules

T07 조직 통계에는 T05에서 node로 해소된 relation만 포함한다. `UNRESOLVED`와
`LEXICAL_EXTRACTION_CONTAMINATION`은 제외한다. lineage edge를 따라 successor roll-up하지
않는다. schema는 label 하나가 서로 다른 temporal node에 관계를 갖는 것을 허용하며 unique
key에 org_node_id가 포함된다. 현재 27 relations에서 multi-node label과 temporal overlap은
모두 0이다.

`FUNCTION_TRANSFERRED_TO`의 machine-readable
`eligible_for_org_successor_rollup=false`는 특정 기능 이관을 조직 승계로 세지 못하게 한다.

## Runtime and identity metadata

- mention_id: extraction_id + contract + type + Unicode code-point span; text는 ID 구성요소가 아님
- label_id: label-v1 + NFC normalized label
- extraction identity: document SHA + extract hash + extraction contract
- recorded runtime: Python 3.13.7, Unicode data 15.1.0

기존 mention/label/extraction ID는 재생성하지 않는다.

## Security contract

analytics schema는 PostgREST 공개 schema가 아니며 public/anon/authenticated에 USAGE 또는
object privilege를 주지 않는다. derived views는 `security_invoker=true`이고 service_role만
읽는다. 기존 SECURITY DEFINER 25개는 fixed empty search_path를 사용한다. 함수는 public-safe
read, service writer, role-scoped authenticated read로 분류하며 writer는 anon/authenticated에
노출하지 않는다. T03 deterministic helper는 service_role EXECUTE가 있는 상태다.

## Staleness and refresh

현재 orphan mention without label, current residual without label, label without source는 모두
0이다. 새 extraction/mention import 뒤에는 T04 label backfill 및 invariant suite를 먼저
통과해야 release 분석을 승인한다. derived analytics views는 별도 stale copy를 만들지 않는다.

## Invariants

- mention exact span, extraction dedupe, parser/extraction FK, attachment observation uniqueness
- mention→notice broken relation 0
- organization temporal conflict 0, lineage cycle 0
- proposal assertion은 direct evidence span 필수
- metric마다 grain/date/release scope 필수
- SECURITY DEFINER fixed search_path 및 writer privilege 위반 0

## Non-goals

- T07 topic membership 또는 dashboard
- PERSON entity, identity, role, affiliation
- organization lineage 확대 또는 successor roll-up
- evidence 없는 proposal assertion과 LLM 자유 추론
- risk score, OCR, embedding, vector index

## Related migrations / code paths

- `supabase/migrations/20260918000400_topic_analysis_contract_hardening.sql`
- `tools/analytics/verify_t065_invariants.sql`
- `tools/analytics/check_t065_contract.mjs`
- `config/topic-analysis-metrics-v1.json`
- `config/analysis-predicates-v1.json`
- `config/analysis-contract-runtime-v1.json`

## Decision history

| Date | Ticket | Decision |
|---|---|---|
| 2026-09-18 | T06.5 | source-expanded mention을 notice grain으로 직접 세지 않는다. |
| 2026-09-18 | T06.5 | RULE label은 regulation identity까지만 exact resolve한다. |
| 2026-09-18 | T06.5 | three rule predicates와 metric grain/date/release를 분리한다. |
| 2026-09-18 | T06.5 | proposal assertion은 보수적 direct evidence만 허용한다. |
| 2026-09-18 | T06.5 | function transfer는 successor roll-up에서 제외한다. |
