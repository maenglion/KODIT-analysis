# Observation, Label, and Entity Model

## Status / 기준 commit

- Status: **T05 COMPLETE — ORGANIZATION NODE / LINEAGE VERIFIED**
- Baseline checkpoint: `a8d28a921a9400cf3f8cc7db3e3fd5574a8fb12f`
- Parent contracts:
  - `KODIT 잔차·관계 온톨로지 작업 티켓 기준 v1`
  - `docs/architecture/document-extraction-ledger.md`
- Mention contract: `mention-v1`
- Extractor version: `kodit-lexical-mentions/0.1.0`

## Purpose

이 문서는 원문에서 관측한 문자열과 이후 집계·entity·relation·분석을 분리한다.
T03의 책임은 immutable extraction text에서 exact span occurrence를 재현 가능하게
보존하는 데까지다. 문자열을 실제 사람·조직·규정 관계로 확정하지 않는다.

## Layer separation

```text
SOURCE
→ OBSERVATION
→ LABEL
→ ENTITY/NODE
→ RELATION
→ ANALYSIS
```

각 계층은 다음 계층을 암시하지 않는다. observation이 존재한다는 사실만으로 label,
entity, relation, topic이 자동 성립하지 않는다.

### T01 observation

```text
NOTICE --HAS_DEPT_STRING--> raw department value
```

T01은 게시판의 `notice_department` 문자열 occurrence를 보존한다. 기준 조직명 20개와
exact match하지 않는 1,272 notice occurrence는
`NOTICE_DEPARTMENT_UNMAPPED_RESIDUAL`로 추적하지만 그 문자열을 사람이나 조직으로
분류하지 않는다.

### T03 observation

```text
EXTRACTION --MENTIONS_*--> raw text span
```

T03은 `core.document_extractions.extracted_text` 안의 exact Unicode code-point span을
`core.extraction_mentions`에 기록한다. T01의 게시판 column observation과 T03의
본문 span observation은 서로 다른 source·identity·table이며 하나로 합치지 않는다.

## Canonical sources

- mention 근거 text: `core.document_extractions`
- mention occurrence: `core.extraction_mentions`
- RULE lexical dictionary: `core.regulations.canonical_name` 1,041건
- RULE 재현 snapshot: checked-in reconstructed-evaluation의 동일 1,041개 이름 집합
- current known ORG exact dictionary: `tools/mentions/mention-v1.json`의 20개 snapshot
- WORK lexicon과 cue/suffix rule: `tools/mentions/mention-v1.json`

현재 ORG 20개는 전체 조직 ontology나 영구 dictionary가 아니다. `mention-v1`의
exact lexical observation을 재현하기 위한 versioned extractor input이다.

## Data model / relation semantics

### `core.extraction_mentions`

한 row는 다음 의미만 가진다.

```text
하나의 immutable extraction에서
versioned deterministic rule이
특정 Unicode span의 문자열을
특정 mention type으로 관측했다.
```

주요 identity:

```text
mention_id = deterministic(
  extraction_id,
  mention_contract_version,
  mention_type,
  span_start,
  span_end
)
```

동일 contract 재실행은 같은 `mention_id`를 만들며 중복 row를 만들지 않는다.
extractor rule이 의미 있게 변경되면 새 `mention_contract_version`을 사용하고 기존
결과를 덮어쓰지 않는다.

### Mention semantics

`PERSON`, `ORG`, `RULE`, `WORK`, `EMAIL`은 entity type 확정이 아니라 extractor가
선택한 **관측 분류**다.

- `PERSON`: 명시적 person cue 또는 연락처 표 구조가 가리킨 이름형 문자열
- `ORG`: versioned exact 조직명 또는 제한된 조직 문맥 pattern candidate
- `RULE`: canonical regulation name의 longest exact lexical match
- `WORK`: versioned 업무·상품·절차 lexicon의 exact match
- `EMAIL`: lexical email pattern의 exact match

`ORG_CONTACT_BLOCK_PATTERN`과 `ORG_CONTEXT_PATTERN_CANDIDATE`는 metadata에
`candidate=true`를 기록한다. 이는 조직 entity 확정이 아니다.

### Span provenance

offset contract:

```text
span_start = zero-based inclusive Unicode code-point offset
span_end   = zero-based exclusive Unicode code-point offset
```

모든 row는 다음을 만족한다.

```text
raw_text == extracted_text[span_start:span_end]
```

DB trigger가 insert 시 전체 계약을 검사하며 corpus backfill 후에도 전수 검증한다.

### Source rollup

mention은 notice row 배열에 복사하지 않는다. 근거는 다음 경로로 역추적한다.

```text
MENTION
→ extraction_id
→ parser run / document extraction
→ binary SHA
→ attachment observation
→ source attachment
→ source record / notice
```

같은 extraction artifact가 여러 source occurrence에서 재사용되어도 mention은 한 번만
존재하며 source/notice별 값은 join으로 계산한다.

## T04 lexical label contract

```text
LABEL
= normalized lexical identity
≠ entity
≠ organization node
```

`label-v1`은 Unicode NFC, outer trim, internal whitespace normalization만 수행한다.
이름·조직 suffix·문장부호·약칭·유사 문자열을 의미적으로 합치지 않는다.
`label_id`는 `(label_contract_version, normalized_label)`로 결정되며 type은 identity에
포함하지 않는다. 동명이인과 시대가 다른 동일 조직명도 LABEL 단계에서는 분리하지
않는다.

원 관측은 그대로 두고 link만 추가한다.

```text
core.extraction_mentions
  → core.extraction_mention_labels
  → core.labels

publish.notice_department_residual_occurrences
  → core.notice_department_residual_labels
  → core.labels
```

T03 `mention_type`만 label type evidence다. T01 department residual은 type evidence를
제공하지 않는다. 단일 mention type만 있으면 그 type, 둘 이상이면 `AMBIGUOUS`, mention
근거가 없으면 `UNTYPED`다. 자동 우선순위와 `NOISE` heuristic은 없다.

`core.label_type_evidence`, `core.label_raw_variants`, `core.label_metrics`는 원 관측을
복제하지 않는 derived security-invoker view다. raw variant는 임의 대표명을 정하지 않고
variant별 mention/residual occurrence 수로 재현한다.

### Timeline contract

`first_seen_at`과 `last_seen_at`은 source observation date만 사용한다.

- T01 residual: `posted_at`
- KODIT T03: 보존 사규예고 `posted_date`가 적재된
  `core.source_records.published_at`
- ALIO T03: `final_modified_date`가 적재된
  `core.source_records.published_at`

parser 실행시각, extraction 생성시각, DB insert 시각은 source date가 아니다. 신뢰할 수
있는 source date가 없으면 NULL로 남긴다.

날짜 coverage의 observation 단위는 source까지 연결된 `(mention_id,
source_record_id)` pair다. 하나의 mention이 둘 이상의 source occurrence에 귀속될 수
있으므로 unique mention 수와 같다고 가정하지 않는다. 현재 ALIO 6,588/6,588,
KODIT mention-source 14,417/14,417, T01 residual 1,272/1,272가 날짜를 가진다.

### T04 corpus verification

| Measure | Result |
|---|---:|
| lexical labels | 2,209 |
| mention links | 20,937 / 20,937 |
| residual links | 1,272 / 1,272 |
| distinct extractions represented | 2,396 |
| distinct source records represented | 2,276 |
| distinct KODIT notices represented | 2,071 |
| invalid normalized labels / broken FK / duplicate mappings | 0 / 0 / 0 |

| Resolved type | Labels |
|---|---:|
| PERSON | 527 |
| ORG | 40 |
| RULE | 759 |
| WORK | 7 |
| EMAIL | 842 |
| AMBIGUOUS | 1 |
| UNTYPED | 33 |

T01의 355 distinct raw department labels는 `label-v1`에서도 355 lexical labels다.
그중 PERSON evidence 317, ORG evidence 5, UNTYPED 33이며 AMBIGUOUS는 0이다. 이는
사람·조직 entity 판정이 아니라 다른 T03 mention에서 관측된 lexical type evidence다.

PERSON mention의 3,457건은 연락처 block+전화 pattern, 3건은 explicit cue에서 왔다.
이 정보만으로 담당자·문의처·기안자 role을 일관되게 재현할 수 없으므로 T04는 role
table을 만들지 않고 role을 `UNKNOWN`으로 보류한다.

`ORG_LABEL ≠ ORG_NODE`다. T05는 T04 ORG type을 곧바로 institutional truth로 사용하지
않고 별도 historical evidence와 node identity 계약을 적용해야 한다.

## Invariants

1. mention은 반드시 `extraction_id`에 귀속한다.
2. notice에 `people_found[]`, `orgs_found[]`, `rules_found[]`를 저장하지 않는다.
3. `raw_text`는 extraction exact span과 같아야 한다.
4. byte offset과 Unicode character offset을 섞지 않는다.
5. mention row는 append-only이며 같은 contract 결과를 덮어쓰지 않는다.
6. 같은 type/span에는 deterministic row가 최대 하나다.
7. RULE은 fuzzy match가 아니라 longest exact lexical match다.
8. PERSON은 모든 2~4음절 한글 문자열을 추측하지 않는다.
9. ORG suffix는 전역 regex가 아니라 명시적 조직 문맥·연락처 블록에서만 candidate로
   사용한다.
10. mention과 entity/relation/analysis를 동일시하지 않는다.

다음 해석은 금지한다.

```text
PERSON mention + ORG mention in same notice
≠ PERSON BELONGS_TO ORG
```

## Corpus verification

`mention-v1`은 2,397 unique extraction을 각각 한 번 분석했다.

| Type | Occurrences | Distinct raw text | Extractions |
|---|---:|---:|---:|
| PERSON | 3,460 | 528 | 2,089 |
| ORG | 5,697 | 41 | 1,941 |
| RULE | 7,402 | 759 | 1,632 |
| WORK | 1,056 | 7 | 175 |
| EMAIL | 3,322 | 842 | 2,009 |
| **Total** | **20,937** | — | — |

- mention이 없는 extraction: 1
- span validation failure: 0
- broken extraction FK: 0
- duplicate deterministic key: 0
- unknown mention type/contract: 0
- source까지 rollup 가능한 mentions: 20,937
- source까지 rollup 가능한 mention-bearing extractions: 2,396
- ALIO source rollup: 6,588 mentions / 205 extractions / 205 source records
- KODIT notice source rollup: 14,349 mentions / 2,191 extractions / 2,033 source records
- 동일 contract dry-run의 신규/예상 밖/변경 mention: 0/0/0

## Later layers

```text
T06
residual resolution UI

T06.5
source/entity/predicate/metric grain hardening

T07
topic analysis
```

T06.5는 T04 type evidence를 `DEPT_STRING_OBSERVATION`, `MENTION_PERSON`,
`MENTION_ORG`, `MENTION_RULE`, `MENTION_WORK`, `MENTION_EMAIL` 채널로 분리해 읽는다.
동일 label의 cross-channel 관측은 실제 entity identity나 role을 뜻하지 않는다.

mention의 notice 통계는 source-expanded row가 아니라 canonical
`(release_id, mention_id, notice_id)` relation에서 distinct notice를 센다. RULE label은
regulation identity까지만 exact resolve하며 regulation version을 이름으로 추측하지 않는다.

## T05 ORG_LABEL vs ORG_NODE

```text
ORG_LABEL = lexical observation aggregate
ORG_NODE  = official-evidence-backed institutional unit with temporal identity
```

같은 문자열은 같은 시대·제도상의 조직을 보장하지 않는다. `organization-v1`은 현재
공식 부서별 업무·연락처 snapshot과 보존 공식 corpus의 exact mention을 이용하며,
이름 유사성만으로 node나 lineage를 만들지 않는다.

`AS_OF`는 label 관측 범위와 공식 evidence를 함께 가진 확정 관계다. node의 유효기간을
증거로 확정할 수 없으면 `PARTIAL_WINDOW`와 NULL boundary를 유지한다. first/last mention
날짜를 조직의 법적 신설·폐지일로 바꾸지 않는다.

### Lineage semantics

- `RENAMED_TO`: 공식 근거가 명칭 변경을 직접 명시한다.
- `MERGED_INTO`: 둘 이상의 조직을 대상 조직으로 통합했다고 직접 명시한다.
- `SPLIT_INTO`: 조직 분할을 직접 명시한다.
- `FUNCTION_TRANSFERRED_TO`: 특정 업무·기능의 담당 이동을 직접 명시한다.
- `SUCCEEDED_BY`: 포괄적 승계를 직접 명시할 때만 사용한다.

근거 우선순위는 직제/업무배분 규정, 공식 조직도·업무 페이지, 공식 조직개편 자료,
공식 변경이력, 공식 사규 예고, 공식 공시, 보존 공식 corpus 순이다. 이번 T05의 lineage
2건은 개인정보 처리방침 전후표가 개인정보보호 기능 담당 부서 이동을 직접 보여주므로
`FUNCTION_TRANSFERRED_TO`로만 기록했다.

```text
same 업무 이동 ≠ 조직 rename
PERSON + ORG co-occurrence ≠ 소속관계
```

T01의 canonical 20개 값은 residual 재현 snapshot이지 T05 organization ontology의
canonical source가 아니다.

T05의 조직 node와 lineage, T07의 소송·투자 등 topic은 별도 근거와 계약을 가져야 한다.

## Non-goals

T04까지도 다음을 만들지 않는다.

- PERSON entity 또는 실제 신원 확정
- ORG node 또는 과거·현재 조직 판정
- PERSON→ORG 소속·기안·담당 relation
- `first_seen` / `last_seen` 집계 원장
- `SUCCEEDED_BY`, `PROPOSES_CHANGE_TO`, `POSSIBLY_INCORPORATED_INTO`
- 소송·투자·보증 topic 또는 위험도 점수
- OCR, embedding, vector index
- publish projection, public API, UI

## Known gaps

- PERSON v1은 명시적 cue와 연락처 표 구조만 대상으로 하므로 그 밖의 이름형 문자열을
  의도적으로 놓친다.
- ORG pattern candidate는 entity가 아니며 T04/T05 검토 전까지 현재·과거 조직으로
  해석하지 않는다.
- EMAIL은 연락처 식별 단서일 뿐 시대·조직 승계 근거가 아니다.
- contract별 active/preferred selection policy는 아직 없다.
- mention이 없는 extraction 1건의 의미를 자동 해석하지 않는다.
- lexical label의 canonical display-name policy는 아직 없다.

## Future cautions

- extractor rule을 바꾸면서 `mention-v1`을 조용히 재작성하지 않는다.
- raw string distinct count를 곧바로 LABEL count로 부르지 않는다.
- T04 `ORG` evidence를 곧바로 현재 또는 과거 `ORG_NODE`로 승격하지 않는다.
- co-occurrence만으로 person affiliation이나 규정 변경 관계를 만들지 않는다.
- source rollup에서 동일 extraction이 여러 attachment에 연결될 수 있음을 보존한다.
- RULE dictionary 변경 시 snapshot과 contract version을 함께 갱신한다.

## Related migrations / code paths

- `supabase/migrations/20260917000300_extraction_mention_ledger.sql`
- `supabase/migrations/20260917000310_extraction_mention_writer_permission.sql`
- `tools/mentions/mention-v1.json`
- `tools/mentions/mention_extractor.py`
- `tools/mentions/backfill_extraction_mentions.py`
- `tools/mentions/run_extraction_mention_backfill.ps1`
- `tools/mentions/check_extraction_mention_contract.mjs`
- `tools/mentions/verify_extraction_mentions.sql`
- `reports/measurements/2026-09-17-extraction-mentions/`
- `supabase/migrations/20260918000100_lexical_label_ledger.sql`
- `tools/labels/backfill_lexical_labels.py`
- `tools/labels/check_lexical_label_contract.mjs`
- `tools/labels/verify_lexical_labels.sql`
- `reports/measurements/2026-09-18-lexical-labels/`

## Decision history

| Date | Ticket | Decision |
|---|---|---|
| 2026-09-17 | T03 | mention을 immutable extraction의 exact span occurrence로 저장한다. |
| 2026-09-17 | T03 | offsets는 zero-based Unicode code point, end-exclusive로 고정한다. |
| 2026-09-17 | T03 | RULE dictionary는 `core.regulations.canonical_name` 1,041건을 사용하고 checked-in 동일 집합으로 재현한다. |
| 2026-09-17 | T03 | PERSON은 explicit cue/contact block, ORG candidate는 제한된 context에서만 관측한다. |
| 2026-09-17 | T03 | mention type은 entity confirmation이 아니며 LABEL/entity/relation은 후속 티켓으로 분리한다. |
| 2026-09-17 | T03 | 같은 contract 재실행은 deterministic ID와 immutable rows를 재사용한다. |
| 2026-09-17 | T03 | 원격 writer는 기존 linked Supabase CLI OAuth와 service-role-only ingestion function을 재사용한다. |
| 2026-09-17 | T03 | generated deterministic ID helper는 stored expression 평가를 위해 service_role에만 EXECUTE를 허용하고 public/anon/authenticated에는 허용하지 않는다. |
| 2026-09-18 | T04 | `label-v1`은 NFC와 공백만 정규화하며 label identity에서 type을 분리한다. |
| 2026-09-18 | T04 | T03 mention type만 type evidence이며 T01 residual은 type evidence가 아니다. |
| 2026-09-18 | T04 | 복수 type은 AMBIGUOUS, evidence 없음은 UNTYPED로 두고 우선순위·NOISE heuristic을 금지한다. |
| 2026-09-18 | T04 | timeline은 KODIT posted date, ALIO final modified date, T01 posted_at만 사용한다. |
| 2026-09-18 | T04 | 동일 입력 재실행에서 신규 label/link와 identity 변화가 모두 0임을 원격에서 검증했다. |
| 2026-09-18 | T05 | ORG label 40개를 현재 exact 19, 과거 confirmed 8, unresolved 13으로 전수 평가했다. |
| 2026-09-18 | T05 | scoped function transfer 2건만 공식 direct evidence edge로 기록하고 person affiliation은 만들지 않았다. |
| 2026-09-18 | T06.5 | evidence channel, mention→notice, RULE→regulation identity, predicate/metric grain을 별도 계약으로 고정했다. |
