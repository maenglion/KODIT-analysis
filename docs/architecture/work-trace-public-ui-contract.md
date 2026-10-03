# Work Trace Public UI Contract

## Status / 기준 commit

- Status: **PUBLIC-SAFE SNAPSHOT + A/B/C PROJECTION READY; MANUS UI PENDING**
- Data contract: `work-trace-evidence-chain-v1`
- UI implementation owner: Manus
- Data/schema owner: Codex

## Purpose

공개 화면은 담당 표기의 정체나 최종 승계 조직을 정하지 않는다. 사규예고·규정·업무분장·조직변경
문서를 순서대로 조사해 확인된 단계와 근거번호를 보여주고, 다음 관계를 확인하지 못한 경우에는
체인을 연결하지 않은 채 멈춘 이유를 표시한다.

프론트는 분류, 유사도 계산, 대표 조직 선택, run 비교 재계산을 하지 않는다. 검증된 공개 snapshot의
값을 그대로 표현한다.

## Entry and navigation

페이지 제목은 `업무 이동 근거 추적`으로 한다. 기존 잔차 화면에서 업무 추적은 `notice_id` 중심의
별도 상세로 이동한다.

세 탐색 방향을 제공한다.

1. 사규예고에서 보기: 기존 잔차 화면은 표기 → 사규예고 목록까지만 제공하고, 업무 추적 상세는
   별도의 notice route로 이동한다. 새 payload에는 raw label 또는 PERSON 별칭을 넣지 않는다.
2. 규정에서 보기: 규정 → 관련 사규예고 → 시기별 업무·근거
3. 현재 부서에서 보기: 현행 조직 → 공식 소관 업무·규정 → 관련 과거 사규예고

세 방향은 같은 trace ledger의 projection이며 프론트에서 서로 다른 통계를 만들지 않는다.

공개 A축을 표기별 집계가 아닌 사규예고별 추적으로 둔 이유는 PERSON 관측 별칭과 조직 endpoint를
하나의 공개 payload에서 결합하지 않기 위해서다. 사용자는 기존 잔차 화면에서 관측 게시물을 고른 뒤
해당 사규예고의 업무 증거사슬로 이동할 수 있지만, work-trace snapshot 자체에는 PERSON·raw label·
residual identity가 없다.

## Static data contract

- snapshot: `apps/public-site/data/public-work-trace-v1.json.gz`
- example fixture: `apps/public-site/data/public-work-trace-v1.fixture.json`
- server loader: `apps/public-site/lib/work-trace-data.ts`
- TypeScript contract: `@kodit/common/regulations/work-trace-contract`
- builder: `pnpm build:work-trace-public`
- verifier: `pnpm check:work-trace-public`
- snapshot SHA-256: `0111c9a5d74ada34f175d34cfc7a5ed45da8ebf94d206af16ded37ebefaa49ad`
- fixture SHA-256: `5ae620102c5ce102f7087c11d555157a1df774946ec0a99c0616ca21a03fe4ef`

화면은 Supabase RPC를 호출하지 않는다. trusted build가 원격 validated run 존재 여부와 dimension 명칭을
확인한 뒤 내부 ID를 제거한 정적 snapshot을 생성한다. 브라우저에는 서비스 키, core ID, raw label,
PERSON 별칭, residual/label identity가 전달되지 않는다.

validated snapshot `public-work-trace-snapshot-v1`의 기대값은 다음과 같다.

| grain | count |
|---|---:|
| 사규예고 추적 branch | 1,272 |
| 관련 규정 | 450 |
| endpoint가 있는 현행 조직 | 22 |
| 공개 근거번호 | 1,622 |
| 조사 backlog 항목 | 677 |
| COMPLETE / CURRENT_FUNCTION_OBSERVED | 38 |
| FUNCTION_MULTIPLE_CANDIDATES | 222 |
| FUNCTION_CORRESPONDENCE_UNCONFIRMED | 650 |
| RELATION_EVIDENCE_GAP | 362 |
| 단일 phrase candidate만 있는 보류 branch | 219 |
| PERSON→ORG 공개 relation | 0 |

관련 규정 450개는 1,041개 전체 규정 수가 아니다. residual 사규예고 중 direct
`PROPOSES_CHANGE_TO`가 확인된 branch가 참조한 distinct 규정 수다. 현행 조직 22개도 조직도 전체
조직 수가 아니라 이번 branch의 direct/candidate endpoint에 실제 나타난 distinct 조직 수다.

## Required page copy

상단 설명:

> 사규예고가 다룬 규정과 업무를 공식 문서에 따라 시간순으로 확인합니다. 확인된 자료가 이어지는
> 지점까지만 표시하며, 다음 관계를 확인할 수 없는 구간은 연결하지 않습니다. 각 단계의 근거문서와
> 추적이 멈춘 이유를 함께 제공합니다.

핵심 주의문:

> 현재 업무분장에서 같은 업무가 확인된다는 사실과, 과거 조직에서 현재 조직으로 공식 이관됐다는
> 사실은 다릅니다. 공식 변경 문서가 없는 구간은 연결하지 않습니다.

## Evidence-chain visual grammar

- 공식 문서 또는 기존 확정 assertion으로 연결된 단계: 실선
- `FUNCTION_PHRASE_CANDIDATE`: 실선과 구분되는 문구 대조 표시. 공식 경로처럼 연결하지 않음
- gap: 선을 긋지 않고 `근거사슬 단절` 블록을 삽입
- 별도 현행 관측: 과거 체인의 연장선 밖에 독립 블록으로 표시
- 모든 단계: `[E-001]` 형태의 공개 근거번호
- 근거번호: 문서 제목, 종류, source/effective date, 해당 문구, 공식 URL을 여는 control

2018년 근거와 2026년 현행 자료 사이를 확인하지 못한 경우 두 노드를 연속 화살표로 연결하지 않는다.

## Terminal outcome labels

| data value | public label | UI treatment |
|---|---|---|
| COMPLETE + CURRENT_FUNCTION_OBSERVED | 현행 업무분장까지 확인 | 완료 범위 문구와 마지막 근거 표시 |
| COMPLETE + OFFICIAL_TRANSFER_PATH_VERIFIED | 공식 이관 경로까지 확인 | 공식 경로 근거를 단계별 표시 |
| SOURCE_DOCUMENT_GAP | 자료 부재 | 현재 확보 범위에서 확인할 수 없음을 설명 |
| RELATION_EVIDENCE_GAP | 연결 근거 부재 | 사전예고↔규정 직접 근거가 없음을 설명 |
| FUNCTION_CORRESPONDENCE_UNCONFIRMED | 대응 미확인 | 규정·업무는 확인됐으나 현행 대응을 확인하지 못함 |
| FUNCTION_MULTIPLE_CANDIDATES | 복수 대응 | 실패/모호 badge가 아닌 주요 산출로 표시 |

`자료가 없다`, `조직변경이 없었다`, `변경은 있었지만 문서를 못 구했다`고 단정하지 않는다.

## Multiple correspondence

각 endpoint를 별도 하위 행으로 표시한다. 하나를 대표 부서로 고르지 않는다.

| correspondence_basis | public label |
|---|---|
| FUNCTION_DIRECT | 공식 업무분장에서 직접 확인 |
| FUNCTION_PHRASE_CANDIDATE | 업무 문구 대조 후보 |

각 행에는 관측 문구, 현행 업무분장 문구, 근거번호를 함께 표시한다. 서로 다른 basis를 같은 강도의
`확인`으로 합치지 않는다.

`FUNCTION_MULTIPLE_CANDIDATES`의 endpoint가 모두 `FUNCTION_PHRASE_CANDIDATE`라면 `업무가 여러
부서로 분산되었다`고 쓰지 않는다. 공개 문구는 `둘 이상의 현행 업무분장 문구가 조사 후보로
확인됨`으로 제한한다. 공식 direct endpoint나 이관문서가 있을 때만 그 근거 수준을 별도로 표시한다.

## Research backlog

표 제목은 `현재 확보 범위에서 추적을 멈추게 한 자료·근거 유형`으로 한다.

열:

- 확인이 필요한 자료·근거
- 대상 기간
- 현재 영향 분기 수
- 관련 사규예고 수
- 관련 규정 수
- 마지막 확인 근거

표 내부 또는 바로 결합된 각주:

> 현재 영향 분기 수는 해당 자료나 근거를 확인하지 못해 당시 추적이 멈춘 분기 수입니다. 자료를
> 확보하더라도 모든 분기가 연장되거나 완료된다는 뜻은 아닙니다.

`COMPLETE`와 `FUNCTION_MULTIPLE_CANDIDATES`는 backlog에 표시하지 않는다.

## CSV grain

CSV는 화면의 정적 snapshot과 같은 행을 사용한다.

1. 추적 분기 CSV: branch 1행. 사규예고 제목·게시일·규정명·종결값·완료범위·마지막 확인일·endpoint
   수·중단 사유를 제공한다. PERSON/표기/내부 ID는 넣지 않는다.
2. endpoint CSV: branch + current organization + correspondence basis 1행. `FUNCTION_DIRECT`와
   `FUNCTION_PHRASE_CANDIDATE`를 같은 값으로 합치지 않는다.
3. 조사 backlog CSV: evidence need 1행. 현재 영향 분기 수는 해결 예상치가 아니라는 각주를 CSV
   metadata 또는 안내문에 유지한다.

프론트는 branch 배열과 endpoint 배열로 CSV를 만들 수 있으나, PERSON 관측 배열과 client-side join해
표기 또는 별칭 열을 추가하지 않는다.

## Run comparison

동일 contract version에서 evidence corpus만 확장된 run끼리 비교한다.

기본 변화는 하나만 표시한다.

- 연장
- 완료
- 종결값 변경
- 정정으로 단축
- 변화 없음

부가 표시는 별도로 둔다.

- 근거 추가
- 복수 대응 전환
- 완료 범위 변경
- 공식 이관 경로 추가

계약 버전이 다른 run은 `자료 확충 효과`로 비교하지 않는다. 이전 결과가 정정된 경우 이전 run에도
`후속 실행에서 정정됨`과 superseding run 링크를 표시한다.

## Expected versus measured evidence effect

자료 추가 전과 후를 다음 열로 함께 보여준다.

- 추가 전 영향 분기
- 실제 연장
- 새로 완료
- 종결값 변경
- 복수 대응 확인
- 여전히 중단
- 추가 근거가 실제 인용된 분기

여러 문서가 한 run에 추가된 경우 문서 하나의 단독 효과로 표현하지 않는다.

## Data literacy disclosures

기술용어는 유지하되 밑줄 또는 명시적인 도움말 control을 제공한다. 클릭하면 바로 아래 설명이
열리고 키보드로 접근·종료할 수 있어야 한다.

필수 용어:

- 증거사슬
- 추적 분기
- 현행 업무분장
- 공식 이관 경로
- 업무 문구 대조
- 자료 부재
- 연결 근거 부재
- 대응 미확인
- 복수 대응
- 추가 전 영향 분기
- 실행 간 변화
- 정정된 과거 실행

설명 원칙:

1. 관측 사실, 문구 대조, 공식 관계를 다른 문장으로 설명한다.
2. `현재 대응`과 `과거부터 현재까지 이관`을 같은 뜻으로 쓰지 않는다.
3. gap은 실패율이 아니라 다음 관계를 확인하지 못한 위치다.
4. 복수 대응은 하나로 못 고른 오류가 아니라 업무가 여러 현행 조직과 연결되는 관측 결과다.
5. evidence 추가 전 영향 수는 해결 예상치가 아니다.
6. run 변화는 모델 정확도가 아니라 같은 계약에서 evidence coverage가 달라진 결과다.

## PERSON public boundary

- PERSON 객체에 조직·부서·직무·이동·후보·경로 field를 추가하지 않는다.
- 인물형 별칭 화면은 승인 별칭과 관측 게시물만 제공한다.
- 업무 추적 상세는 notice route이며 PERSON 별칭을 payload에 포함하지 않는다.
- 현재 부서 축에 PERSON 별칭을 나열하지 않는다.
- `이 사람의 현재 부서`라는 문구를 사용하지 않는다.
- `이 사전예고가 다룬 업무의 현행 업무분장 대조`로 표현한다.

## Frontend prohibitions

- local score 또는 threshold 계산
- 대표 조직 자동 선택
- 원인 추정 label
- gap을 건너뛴 선 또는 animation
- 복수 대응을 실패·모호로 표시
- official transfer와 phrase candidate 합산
- snapshot에 없는 숫자·연도·법적 의미 생성
- PERSON과 organization payload client-side join
- verified snapshot 이전 운영 배포

## Release gate

Manus의 데이터 연결 구현은 다음을 받은 뒤 시작한다.

1. validated trace run — 완료 (`a00dba9a-4f99-2ece-ce53-35fc87afc433` / branch 1,272)
2. public-safe snapshot schema와 fixture — 완료
3. A/B/C aggregate grain 정의 — 완료
4. 근거 detail URL contract — 완료 (`evidence_no` → snapshot evidence dictionary)
5. PERSON→ORG 공개 relation 0건 검증 — 완료
6. Codex가 제공한 expected counts — 완료

2026-10-04 remote validated run과 정적 snapshot이 모두 38/222/650/362를 재현했다. core 원장 수치를
프론트가 직접 읽지 않으며 UI에 숫자를 하드코딩하거나 임시 RPC로 노출하지 않는다.

UI는 이 문서나 fixture의 임시 숫자를 운영 값으로 사용하지 않는다.

## Decision history

| Date | Decision |
|---|---|
| 2026-10-03 | evidence-chain DB 계약이 먼저이고 UI는 검증된 snapshot만 소비하도록 분리했다. |
| 2026-10-03 | 친절한 데이터 리터러시와 법률 독자가 이해할 수 있는 gap·근거 설명을 release gate에 포함했다. |
| 2026-10-04 | core run 1,272건은 원격 검증됐으나 public-safe snapshot과 A/B/C projection은 별도 release gate로 유지했다. |
| 2026-10-04 | 내부 ID·PERSON·raw label을 제거한 정적 snapshot과 notice/regulation/current-org A/B/C projection을 검증해 Manus UI gate를 열었다. |
