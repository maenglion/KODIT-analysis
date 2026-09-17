# Observation, Label, and Entity Model

## Status / 기준 commit

- Status: **T03 COMPLETE — EXTRACTION MENTION LEDGER VERIFIED**
- Baseline commit: `228549b9eafd8c6828fe5f6b267ddd20f4f76725`
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
T04
raw mention aggregation / label typing

T05
historical organization node / lineage

T06
residual resolution UI

T07
topic analysis
```

T04는 distinct raw string을 집계하고 typing할 수 있지만 T03 row를 수정하지 않는다.
T05의 조직 node와 lineage, T07의 소송·투자 등 topic은 별도 근거와 계약을 가져야 한다.

## Non-goals

T03은 다음을 만들지 않는다.

- LABEL table 또는 canonical label
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

## Future cautions

- extractor rule을 바꾸면서 `mention-v1`을 조용히 재작성하지 않는다.
- raw string distinct count를 곧바로 LABEL count로 부르지 않는다.
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
