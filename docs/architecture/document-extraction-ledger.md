# Document Extraction Ledger

## Status / 기준 commit

- Status: **T02-A DESIGN REVIEW — DRAFT, NOT IMPLEMENTED**
- Baseline commit: `259f9b12de6120e38d3904e557de39c0ca142b74`
- Parent contract: `KODIT 잔차·관계 온톨로지 작업 티켓 기준 v1`
- Scope: corpus 본문 영속화와 provenance 경계의 설계 검토

이 문서는 T02-A에서 확인한 현재 사실과 장기 의미 계약을 보존한다. 아래의
테이블 구조는 T02-B 구현 전 최종 schema 검토에서 조정될 수 있다. 이 문서 자체는
migration 적용이나 corpus 재처리를 승인하지 않는다.

## Purpose

HWP, HWPX, PDF parser가 실행 중 생성하는 본문을 이후 mention occurrence의 근거로
사용할 수 있도록, 문서·첨부·parser 실행·추출 결과 사이의 identity와 provenance
경계를 정의한다.

핵심 목적은 미래의 mention이 단순한 `notice_id`나 복사된 문자열이 아니라, 실제
추출 결과와 원 binary까지 역추적되도록 하는 것이다.

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

T02-A의 우선 설계안은 다음 네 계층이다.

```text
core.source_attachments
core.source_attachment_observations
core.document_extractions
core.parser_runs
```

이 객체명과 세부 column은 T02-B 구현 전 기존 schema와 migration 규칙에 맞춰
조정할 수 있다. 의미 경계는 다음과 같이 유지한다.

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

실패 run은 `extraction_id`가 없다. `NO_EXTRACTABLE_TEXT`도 parser outcome으로
run에 보존하되, 빈 본문 artifact를 반드시 생성해야 하는 것으로 정의하지 않는다.

## Invariants

1. SHA-256은 binary document의 canonical identity다.
2. `notice_id`, URL, filename은 document identity로 사용하지 않는다.
3. source attachment, binary observation, parser run, extraction artifact는 서로 다른
   identity를 갖는다.
4. `document_extractions`는 생성 후 본문·hash를 수정하지 않는다.
5. `parser_runs`는 매 실행마다 새 row를 만들고 과거 실행을 덮어쓰지 않는다.
6. 동일 binary를 같은 parser로 재처리해 동일 text가 나오면 새 parser run은
   보존하되 기존 extraction artifact를 재사용할 수 있다.
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

## Known gaps

- generic persistent `attachment_id`가 아직 없다.
- 현재 corpus measurement JSON에는 본문이 없다.
- measurement artifact에는 corpus 상대경로만 있고 절대 corpus root는 없다.
- parser provenance는 checked-in JSON에는 있으나 DB 원장에는 없다.
- corpus binary와 source별 attachment 복합키를 DB identity로 이관하는 deterministic
  import 계약이 아직 없다.
- `core.documents.extracted_text`를 읽는 모든 소비자가 확인되지 않았다.
- extraction artifact와 parser run을 실제로 적재할 T02-B migration은 아직 없다.

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
