# Document Extraction Ledger

## Status / 기준 commit

- Status: **T02-C COMPLETE — CORPUS EXTRACTION BACKFILL VERIFIED**
- Baseline commit: `259f9b12de6120e38d3904e557de39c0ca142b74`
- Parent contract: `KODIT 잔차·관계 온톨로지 작업 티켓 기준 v1`
- Scope: corpus 본문 영속화와 provenance 경계의 설계 검토

이 문서는 T02-A에서 확인한 현재 사실과 장기 의미 계약을 보존한다. T02-B에서
아래 네 내부 원장과 선택적 private extraction artifact 출력 경계를 구현하고,
원격 migration 및 최소 HWP/HWPX/PDF integration을 검증했다. T02-C에서는 보존
corpus 2,414건을 같은 pinned parser runtime으로 재생성하여 immutable extraction
ledger에 영속화하고, 동일 입력의 재실행이 새 row를 만들지 않음을 검증했다.

## Purpose

HWP, HWPX, PDF parser가 실행 중 생성하는 본문을 이후 mention occurrence의 근거로
사용할 수 있도록, 문서·첨부·parser 실행·추출 결과 사이의 identity와 provenance
경계를 정의한다.

핵심 목적은 미래의 mention이 단순한 `notice_id`나 복사된 문자열이 아니라, 실제
추출 결과와 원 binary까지 역추적되도록 하는 것이다.

이 작업의 순서는 다음과 같이 고정한다.

```text
T01
department residual occurrence
완료

T02-A
extraction persistence schema review
완료

T02-B
attachment / binary / parser run / extraction persistence
완료

T02-C
corpus extraction backfill
완료

T03
extraction 기반 mention occurrence
PERSON / ORG / RULE / WORK / EMAIL
완료

T04
label aggregation + typing
다음 단계

T05
historical ORG_NODE + lineage

T06
residual resolution UI

T07
topic analysis
```

> 지금까지는 SHA로 같은 파일을 봤고, 이제 `extract_hash`로 같은 글을 고정한 뒤
> 그 글 안의 언급을 센다.

T02-B는 binary를 다시 수집하는 프로젝트가 아니다. 이미 보유하고 있고 parser가
읽을 수 있었던 binary에서 생성된 text를 더 이상 폐기하지 않고 provenance와 함께
보존하는 변경이다.

따라서 T02-B의 완료조건은 mention을 만드는 것이 아니다. 먼저 2,414개 문서에서
어떤 binary를 어떤 parser contract로 읽어 어떤 extraction을 만들었는지 안정적으로
재현해야 한다. T03은 그 검증을 마친 고정 `extraction_id` 위에서만 시작한다.

## Current facts

### Current flow

현재 일반 corpus의 처리 흐름은 다음과 같다.

```text
source record
→ source-specific attachment
→ preserved binary
→ SHA-256/magic parser selection
→ parser run
→ extracted text in memory
→ extract_hash / char_count
→ measurement JSON
→ text discarded
```

- HWP, HWPX, PDF runner는 본문을 메모리에서 생성한다.
- runner는 `extract_hash`, `extracted_char_count`, 실행 provenance를 measurement
  JSON에 남긴다.
- 일반 corpus의 extracted text 문자열은 measurement JSON이나 DB에 영속화되지
  않고 runner 종료 시 폐기된다.
- 예외적으로 최초 단일 PDF vertical slice는 `core.documents.extracted_text`에
  본문을 upsert하지만, 이 경로는 corpus-wide immutable extraction ledger가 아니다.
- `publish` 계층에는 공개 가능한 source·파일·SHA·representation metadata가
  projection되지만 추출 본문과 parser run 원장은 포함되지 않는다.

### Corpus size

현재 parser 대상 corpus 측정치는 다음과 같다.

| Format | Documents | Non-empty extraction | Characters |
|---|---:|---:|---:|
| OLE HWP | 326 | 326 | 2,902,382 |
| ZIP HWPX | 358 | 358 | 779,751 |
| PDF | 1,730 | 1,719 | 1,093,787 |
| **Total** | **2,414** | **2,403** | **4,775,920** |

하나의 canonical extraction text를 binary별로 한 번 저장할 경우 raw UTF-8 text는
대략 4.6~13.7 MiB 범위로 예상된다. provenance row와 index를 포함하더라도 본문
영속화 자체는 현재 corpus 규모에서 주요 용량 제약이 아니다.

동일 text를 parser run마다 중복 저장하지 않는다. 실행 이력은 모두 보존하되,
동일 binary에서 동일 `extract_hash`가 재현되면 extraction artifact를 재사용할 수
있어야 한다.

### Persisted corpus result

T02-C는 기존 보존 binary만 사용했으며 새 다운로드나 재수집을 수행하지 않았다.

| Metric | Count |
|---|---:|
| Input occurrences | 2,414 |
| Source attachments | 2,414 |
| Attachment observations | 2,414 |
| Unique binary documents | 2,408 |
| Parser runs | 2,414 |
| Non-empty extraction occurrences | 2,403 |
| Unique extraction artifacts | 2,397 |
| Stored canonical characters | 4,770,977 |

입력 occurrence 기준 결과는 `SUCCESS 2,370`, `IDENTITY_NOT_FOUND 33`,
`NO_EXTRACTABLE_TEXT 1`, `EXTRACTION_FAILED 10`이다. identity 결과는 parser가
본문을 정상 생성한 경우의 별도 관측값이므로 33건에도 extraction artifact가 있다.
실패 10건은 모두 `DOCUMENT/PDF_READ_FAILED`다. 실패와 no-text 11건은 parser run만
보존하며 `extraction_id`는 `NULL`이고 빈 extraction artifact는 만들지 않았다.

2,403개 non-empty input occurrence가 2,397개 canonical extraction으로 저장되어,
같은 binary·contract·text에 해당하는 6개 representation은 기존 extraction artifact를
재사용했다.

## Canonical sources and identity

### Binary document

- binary 정본 identity는 SHA-256이다.
- 현재 DB에서는 `core.documents.sha256`, runner에서는 `input_sha256`으로 표현된다.
- URL과 파일명은 같은 값에서 binary가 교체될 수 있으므로 document identity가
  아니다.
- `notice_id`는 게시물 occurrence identity이며 document identity가 아니다.
- 하나의 notice에는 여러 attachment와 여러 binary representation이 존재할 수 있다.

### Attachment

현재 모든 source를 포괄하는 generic persistent `attachment_id`는 없다. 보존
artifact와 corpus runner는 source별 복합키로 attachment를 재식별한다.

```text
KODIT attachment = post_number + evidence_file_key
ALIO attachment  = rule_id + file_no
```

이 복합키는 T02-B에서 `core.source_attachments`의 안정적인 identity로 변환할
후보다. URL이나 filename만으로 attachment를 재식별하지 않는다.

### Parser run and extraction

- `parser_run_id`는 개별 실행 identity다.
- `extract_hash`는 추출 본문의 content identity다.
- parser run과 extraction artifact는 같은 개념이 아니다.
- 같은 extraction artifact를 여러 parser run이 재현할 수 있다.
- 실패한 parser run에는 extraction artifact가 없을 수 있다.

## Proposed data model / relation semantics

T02-B가 고정하는 provenance chain은 다음 범위까지다.

```text
NOTICE
  └─ has_attachment → SOURCE_ATTACHMENT
         └─ observed_as → BINARY (sha256)
                └─ extracted_as → EXTRACTION (extract_hash)
```

T03에서 처음 extraction을 근거로 mention occurrence를 만든다.

```text
EXTRACTION
  ├─ MENTIONS_PERSON
  ├─ MENTIONS_ORG
  ├─ MENTIONS_RULE
  ├─ MENTIONS_WORK
  └─ MENTIONS_EMAIL
```

mention을 notice row의 `people_found[]`, `orgs_found[]` 같은 배열로 직접 저장하지
않는다. 첨부가 여러 개이거나 binary SHA 또는 parser contract가 바뀌어도 근거를
재현할 수 있도록 mention은 반드시 `extraction_id`에 귀속한다.

T02-B migration은 다음 네 계층을 구현한다.

```text
core.source_attachments
core.source_attachment_observations
core.document_extractions
core.parser_runs
```

원격 integration에서 다음 의미 경계와 제약을 검증했다.

### `core.source_attachments`

source record 안의 논리적 첨부파일을 식별한다.

- source-specific attachment key를 보존한다.
- KODIT의 `evidence_file_key`, ALIO의 `file_no`를 같은 의미로 덮어쓰지 않고
  source context와 함께 저장한다.
- notice나 source record와 document binary를 동일시하지 않는다.

후보 unique contract:

```text
(source_record_id, external_attachment_key)
```

### `core.source_attachment_observations`

논리적 attachment와 특정 시점에 관찰된 URL/binary를 연결한다.

- 같은 attachment URL에서 binary SHA가 바뀌는 경우 새 observation을 만든다.
- 기존 `core.document_url_observations`와 연결하여 관찰 시점과 binary를 추적한다.
- 과거 observation을 덮어쓰지 않는다.

### `core.document_extractions`

추출 본문은 parser 최신값을 덮어쓰는 mutable column이 아니라 **immutable derived
artifact**다.

최소 의미 필드 후보:

```text
extraction_id
document_sha256
extract_hash
extraction_contract_version
extracted_text
extracted_char_count
created_at
```

후보 dedupe contract:

```text
(document_sha256, extract_hash, extraction_contract_version)
```

세 identity의 의미는 다음과 같이 고정한다.

```text
SHA-256
= 같은 binary인가

extract_hash
= 같은 추출 text인가

extraction_contract_version
= 어떤 추출 계약으로 text가 만들어졌는가
```

같은 SHA라도 extraction contract가 달라지면 결과 text가 바뀔 수 있다. 따라서
extraction artifact dedupe에는 `extraction_contract_version`을 반드시 포함한다.

### `core.parser_runs`

parser 실행은 성공과 실패를 포함해 실행마다 별도 immutable row로 보존한다.

최소 provenance 후보:

```text
parser_run_id
attachment_observation_id
document_sha256
extraction_id nullable
parser_name / parser_version
parser_engine / parser_engine_version
code_commit_sha / parser_source_sha256
runtime_version / dependency_lock_hash / runtime_manifest_sha256
environment_fingerprint
provenance / evidence_as_of
started_at / finished_at
result
failure_domain / failure_code
sanitized error / traceback
created_at
```

실패 run과 `NO_EXTRACTABLE_TEXT` run은 `extraction_id`가 없다. 이 경우 빈
extraction artifact를 생성하지 않고 다음처럼 실행 사실만 보존한다.

```text
parser_run 존재
extraction_id = NULL
```

이는 정상 extraction이 생성됐지만 이후 T03 mention 결과가 0건인 상태와 의미가
다르다.

```text
정상 extraction 생성
MENTIONS_* = 0
```

### Internal persistence boundary

`core.record_parser_execution(uuid, jsonb, jsonb)`은 직접 PostgreSQL 연결에서만
사용하는 service-role 전용 security-invoker 함수다. PostgREST 공개 schema에
노출되는 public RPC가 아니다.

- runner provenance와 private extraction artifact의 상호 일치를 검증한다.
- `IDENTITY_NOT_FOUND`는 parser 실패가 아니므로 `parser_result=SUCCESS`,
  `identity_matched=false`로 분리 저장한다.
- 동일 document/hash/contract extraction은 재사용하고 parser run은 새로 적재한다.
- 성공 text run에 artifact가 없거나 실패 run에 artifact가 붙으면 거절한다.
- public, anon, authenticated에는 EXECUTE를 부여하지 않는다.

## Invariants

1. SHA-256은 binary document의 canonical identity다.
2. `notice_id`, URL, filename은 document identity로 사용하지 않는다.
3. source attachment, binary observation, parser run, extraction artifact는 서로 다른
   identity를 갖는다.
4. `document_extractions`는 생성 후 본문·hash를 수정하지 않는다.
5. `parser_runs`는 매 실행마다 새 row를 만들고 과거 실행을 덮어쓰지 않는다.
6. 동일 binary를 동일 extraction contract로 재처리해 동일 text가 나오면 새 parser
   run은 보존하되 기존 extraction artifact를 재사용한다.
7. parser version이나 runtime이 변경되면 반드시 새 parser run으로 기록한다.
8. 같은 URL·filename에서 SHA가 달라지면 새 document binary와 새 extraction으로
   처리한다.
9. parser 실패는 parser run에 기록하고 성공한 extraction으로 가장하지 않는다.
10. full traceback은 secret과 로컬 절대경로를 제거한 sanitized 값만 내부 원장에
    저장한다.
11. release/public projection은 extraction의 canonical identity가 아니다.
12. mention은 복사된 text나 `notice_id`만으로 근거를 표현하지 않는다.

## Future mention provenance

미래 mention occurrence는 최소 다음 경로로 원 근거까지 역추적 가능해야 한다.

```text
MENTION
→ extraction_id
→ parser run / document extraction
→ document binary
→ attachment observation
→ source attachment
→ source record / notice
```

mention이 `notice_id`와 extracted text 문자열만 참조하는 구조는 허용하지 않는다.
동일 notice의 여러 첨부, 동일 첨부의 binary 교체, parser version 변경을 구분할 수
없기 때문이다.

## Existing `core.documents.extracted_text`

`core.documents.extracted_text`를 extraction 본문의 canonical source로 승격하지
않는다.

권고 방향:

- 당분간 기존 소비자를 위한 compatibility/cache column으로 유지한다.
- 신규 corpus 본문의 canonical source는 `core.document_extractions`로 둔다.
- 미래 mention은 `extraction_id`를 참조한다.
- preferred/latest text는 기존 본문을 덮어쓰는 방식이 아니라 향후 view 또는
  명시적 selection policy로 해결한다.
- 소비자 전환이 확인되기 전에는 기존 column을 삭제하지 않는다.

이는 기존 필드의 지위를 `canonical`이 아니라 `compatibility/cache`로 한정하는
결정이다.

## Parser rerun and versioning behavior

### 동일 source + 동일 parser 재실행

```text
new parser_run
+ same document_sha256 and extract_hash
→ existing extraction artifact may be reused
```

### 동일 source + parser version 변경

새 parser run을 생성한다. 결과 hash가 같으면 기존 extraction artifact를 참조하고,
결과가 달라지면 새 immutable extraction artifact를 만든다. 이전 결과는 유지한다.

### 동일 URL/filename + source binary 변경

새 URL observation과 새 `core.documents.sha256`를 만든다. 논리적 attachment는 유지할
수 있으나 parser run과 extraction은 새 binary에 귀속된다.

### Parser failure

실패도 parser run으로 보존한다. 성공한 본문 artifact는 만들지 않으며, 실패를
document availability나 mention evidence로 사용하지 않는다.

## Non-goals

이 문서와 T02-B의 extraction persistence 단계에서는 다음을 다루지 않는다.

- PERSON / ORG / RULE / WORK mention 추출
- EMAIL mention 추출
- `MENTIONS_PERSON`, `MENTIONS_ORG`, `MENTIONS_RULE`, `MENTIONS_WORK`,
  `MENTIONS_EMAIL` table 또는 relation 생성
- LABEL entity
- 사람·조직 semantic normalization
- 조직 lineage
- `PROPOSES_CHANGE_TO`
- preferred extraction 선정 정책
- OCR 정책 또는 OCR 실행
- topic analysis
- public fulltext API
- vector embedding
- confidence 또는 human-confirmation 계산
- regulation availability 재판정
- publish UI 변경

`MENTIONS_*` table은 T02-B migration에 절대 포함하지 않는다. attachment, binary,
parser run, extraction 원장을 먼저 완성하고 corpus 재현성을 검증한 후 T03의 별도
migration에서 설계한다.

## Known gaps

- T02-C 대상 2,414건의 attachment/binary/parser run/extraction은 원격 원장에
  적재됐지만, 기존 measurement JSON 자체에는 본문이 없다.
- measurement artifact에는 corpus 상대경로만 있고 절대 corpus root는 없다.
- `core.documents.extracted_text`를 읽는 모든 소비자가 확인되지 않았다.
- PDF 10건의 `DOCUMENT/PDF_READ_FAILED`와 1건의 `NO_EXTRACTABLE_TEXT`는 후속
  정책 없이 관측 상태 그대로 남아 있다.

## Future cautions

- checked-in measurement JSON만으로 본문을 복원할 수 있다고 가정하지 않는다.
  본문 재생성에는 보존 binary corpus와 SHA 일치 검증이 필요하다.
- corpus root가 확인되기 전 재다운로드를 자동 대체수단으로 사용하지 않는다.
- parser run provenance와 extraction content dedupe를 한 테이블의 overwrite 동작으로
  합치지 않는다.
- parser의 identity-match 결과를 extraction 본문의 canonical 속성으로 섞지 않는다.
- attachment identity를 publish release ID나 public notice row에 종속시키지 않는다.
- full text는 내부 evidence다. 공개 API 제공 여부는 별도 계약과 보안 검토 없이는
  결정하지 않는다.
- runner의 `--extraction-output`은 DB 적재 전 transport artifact다. 저장소에
  commit하지 않고 `.gitignore`가 적용되는 `artifacts/` 또는 동등한 private 경로에만
  둔다.

## Related migrations / code paths

현재 관련 schema와 code path:

- `supabase/migrations/20260905000100_initial_secure_schema.sql`
  - `core.source_records`
  - `core.documents`
  - `core.document_urls`
  - `core.document_url_observations`
  - `core.regulation_documents`
- `supabase/migrations/20260909000100_ten_day_collection_schedule.sql`
  - URL observation idempotence key
- `supabase/migrations/20260914000100_publish_read_model.sql`
  - 공개 projection이며 extraction 정본이 아님
- `workers/collector/collect_regulation.py`
  - 단일 PDF vertical slice의 mutable `extracted_text` upsert
- `workers/collector/hwp_parser_runner.py`
- `workers/collector/hwpx_parser.py`
- `workers/collector/hwpx_parser_runner.py`
- `workers/collector/pdf_parser.py`
- `workers/collector/pdf_parser_runner.py`
- `workers/collector/parser_contract.py`
- `reports/measurements/2026-09-13-runtime-v1-reproduction/`
- `reports/measurements/2026-09-13-pdf-full-corpus/`
- `supabase/migrations/20260917000200_document_extraction_ledger.sql`
- `workers/collector/extraction_artifact.py`
- `tools/extractions/check_document_extraction_contract.mjs`
- `tools/extractions/verify_document_extraction_ledger.sql`
- `workers/collector/test_document_extraction_integration.py`
- `workers/collector/requirements-integration.txt`
- `tools/extractions/run_document_extraction_integration.ps1`
- `tools/extractions/backfill_document_extractions.py`
- `tools/extractions/run_document_extraction_backfill.ps1`
- `reports/measurements/2026-09-17-document-extraction-backfill/`

T02-B의 파일 후보는 신규 extraction ledger migration, DB contract test, parser runner의
본문 artifact 전달 경계, 그리고 versioned corpus import 도구다. `publish` RPC와 UI는
T02-B의 기본 변경 대상이 아니다.

## Decision history

| Date | Ticket | Decision |
|---|---|---|
| 2026-09-17 | T02-A | binary canonical identity를 SHA-256으로 유지한다. |
| 2026-09-17 | T02-A | notice와 attachment/document identity를 분리한다. |
| 2026-09-17 | T02-A | generic persistent attachment identity가 현재 없음을 확인했다. |
| 2026-09-17 | T02-A | extraction text를 immutable derived artifact로 설계한다. |
| 2026-09-17 | T02-A | parser run은 성공·실패 모두 실행별로 보존한다. |
| 2026-09-17 | T02-A | 동일 text 재현 시 run은 추가하되 text artifact는 재사용할 수 있다. |
| 2026-09-17 | T02-A | `core.documents.extracted_text`는 canonical이 아니라 compatibility/cache로 유지한다. |
| 2026-09-17 | T02-A | mention은 미래에 `extraction_id`를 통해 원 binary와 source까지 역추적한다. |
| 2026-09-17 | T02-B | 네 개의 `core` extraction ledger table을 additive local migration으로 구현했다. |
| 2026-09-17 | T02-B | measurement JSON과 private extracted-text artifact를 분리하는 선택적 runner sink를 구현했다. |
| 2026-09-17 | T02-B | service-role 전용 security-invoker persistence boundary로 run/artifact 일치 검증을 고정했다. |
| 2026-09-17 | T02-B | 원격 migration을 적용하고 HWP/HWPX/PDF 최소 표본 integration을 검증했다. |
| 2026-09-17 | T02-B | 운영 corpus persistence는 T02-C, mention extraction은 T03으로 분리한다. |
| 2026-09-17 | T02-B | `MENTIONS_*`는 extraction 원장과 분리하고 T03 이전에는 생성하지 않는다. |
| 2026-09-17 | T02-B | SHA로 binary identity를 고정한 뒤 extract_hash로 text identity를 고정하고, mention은 그 다음에 센다. |
| 2026-09-17 | T02-B | extraction artifact dedupe identity를 `(document_sha256, extract_hash, extraction_contract_version)`으로 고정한다. |
| 2026-09-17 | T02-B | failure와 `NO_EXTRACTABLE_TEXT`는 run만 보존하고 빈 extraction artifact를 생성하지 않는다. |
| 2026-09-17 | T02-B | mention은 notice 배열이 아니라 `extraction_id`에 귀속한다. |
| 2026-09-17 | T02-B | 원격 최소 표본 검증의 assertion은 integration pytest에 두고 PowerShell은 pinned runtime launcher로만 사용한다. |
| 2026-09-17 | T02-C | 보존 corpus 2,414건을 pinned runtime으로 재생성하여 immutable extraction ledger에 적재했다. |
| 2026-09-17 | T02-C | 로컬 비밀번호 입력 대신 기존 Supabase CLI OAuth 및 linked-project Management API 경로를 trusted writer로 재사용했다. |
| 2026-09-17 | T02-C | writer transaction 안에서 `service_role`로 전환하여 기존 `core.record_parser_execution()` 경계만 사용했다. |
| 2026-09-17 | T02-C | 같은 corpus의 dry-run 재실행에서 새 attachment, observation, binary, parser run, extraction이 모두 0건임을 확인했다. |

## Verification

- 2026-09-17 local verification: parser regression 31 tests and extraction-artifact
  3 tests passed; static extraction contract check passed.
- 원격 migration `20260917000200_document_extraction_ledger` 적용과 생성 객체 네 개를
  확인했다.
- 실물 HWP/HWPX/PDF 표본 integration은 **3 PASS / 0 SKIP / 0 FAIL**로 완료했다.
- 각 format에서 동일 binary와 동일 contract를 두 번 실행하여 `parser_runs=2`,
  `document_extractions=1`, 동일 `extraction_id` 재사용을 확인했다.
- integration pytest는 실제 HWP/HWPX/PDF runner를 같은 contract로 각각 두 번
  실행하고, service-role DB 권한으로 run/artifact를 적재한 뒤 FK와 dedupe 결과를
  read-back한다.
- DB fixture는 명시적인 `T02B_INTEGRATION_*` 식별자를 사용하며 한 transaction에서
  수행한 뒤 항상 rollback한다.
- 성공 실행은 run 두 행과 extraction 한 행을 검증하고 동일 `extraction_id` 재사용을
  확인한다.
- 합성 `NO_EXTRACTABLE_TEXT` PDF와 magic-mismatch 실패 PDF는 run만 생성되고 빈
  extraction이 생성되지 않음을 검증한다.
- `core.documents.extracted_text`는 읽거나 갱신하는 canonical 경로로 사용하지 않으며,
  테스트 전후 값이 변하지 않는지 확인한다.
- integration target은 mention table을 생성하거나 채우지 않음을 확인한다.
- transaction rollback 후 네 extraction ledger table과 `T02B_INTEGRATION_*` source의
  테스트 잔존 행이 모두 0건임을 별도 connection에서 확인했다.
- T02-C apply 결과는 2,414 parser run, 2,408 unique binary, 2,397 unique extraction이며
  hash/char-count/FK/unique-key 위반은 모두 0건이다.
- 같은 corpus dry-run 결과는 outcome 분포와 extraction hash가 모두 동일했고,
  신규 ledger row와 변경 text가 각각 0건이었다.
- publish 규정 1,041건, notice 2,089건, notice-regulation linkage 3,775건,
  department residual 1,272건 및 legacy `core.documents.extracted_text`는 전후 동일했다.
- T02-C는 mention table 또는 row를 생성하지 않았다. T03이 다음 단계다.
