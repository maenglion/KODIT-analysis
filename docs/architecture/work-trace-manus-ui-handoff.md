# Work Trace Manus UI Handoff

## Status / 기준 commit

- Status: **DATA CONTRACT READY; UI NOT IMPLEMENTED**
- Snapshot contract: `public-work-trace-snapshot-v1`
- Trace run: `a00dba9a-4f99-2ece-ce53-35fc87afc433`
- UI owner: Manus
- Data/schema owner: Codex

## Purpose

이 화면은 담당 표기의 정체나 사람의 현재 소속을 맞히는 화면이 아니다. 사규예고 한 건이 다룬
규정과 업무를 공식 자료에 따라 순서대로 조사하고, 확인된 단계와 증거사슬이 끊긴 위치를 보여준다.
잔차 분류는 입력이며 산출은 업무 추적 경로, 복수 대응, 중단 지점과 다음 조사자료다.

## Ready-to-use files

- `apps/public-site/data/public-work-trace-v1.json.gz`
- `apps/public-site/data/public-work-trace-v1.fixture.json`
- `apps/public-site/lib/work-trace-data.ts`
- `packages/common/src/regulations/work-trace-contract.ts`
- `docs/architecture/work-trace-public-ui-contract.md`

페이지 server component에서 다음처럼 읽는다.

```ts
import { getWorkTraceDataset } from "@/lib/work-trace-data";

const dataset = await getWorkTraceDataset();
```

브라우저 Supabase 호출, 새 public RPC, core query, fixture 숫자 하드코딩은 필요하지 않다.

## Screen structure

권장 route는 `/work-traces`이며 제목은 `업무 이동 근거 추적`이다.

1. 상단 요약
   - 추적 branch 1,272건
   - 현행 업무분장까지 직접 확인 38건
   - 복수 문구 대응 222건
   - 대응 미확인 650건
   - 연결 근거 부재 362건
   - 이 값은 해결률이나 조직 추론 정확도가 아니라 현재 evidence coverage다.
2. 탐색 탭
   - 사규예고에서 보기: `axes.notices`
   - 규정에서 보기: `axes.regulations`
   - 현재 부서에서 보기: `axes.current_organizations`
3. branch detail
   - `branches`의 step 순서를 세로 증거사슬로 표시
   - 각 step의 `evidence_numbers`를 evidence drawer와 연결
   - gap에서는 선을 끊고 `break.public_explanation`을 표시
   - phrase candidate는 점선 또는 별도 대조 블록으로 표시하고 공식 경로처럼 연결하지 않음
4. 조사 backlog
   - `research_backlog`
   - 현재 영향 분기 수는 해결 예상치가 아니라는 각주를 표 안에 유지
5. 실행 간 변화
   - 최초 run이므로 `run_comparisons`는 빈 배열
   - 빈 상태를 `비교할 이전 검증 실행이 없습니다`로 표시하고 숫자를 만들지 않음

## A/B/C grain

### A — 사규예고

`axes.notices` 한 행은 공개 사규예고 한 건이다. 표기 문자열이나 PERSON 별칭이 아니다. 행을 열면
`public_branch_keys`에 해당하는 branch detail을 보여준다.

### B — 규정

`axes.regulations` 한 행은 distinct 규정 한 건이다. `notice_count`, `branch_count`,
`current_org_count`를 구분한다. 450개는 전체 규정 1,041개가 아니라 이번 trace에서 직접 개정 대상
규정으로 연결된 distinct 규정 수다.

### C — 현재 부서

`axes.current_organizations` 한 행은 이번 branch endpoint에 나타난 현행 조직 한 건이다.
`direct_branch_count`와 `candidate_branch_count`를 분리한다. candidate를 담당 확정으로 합산하지 않는다.

## Evidence drawer

`evidence_no`는 `[E-0001]` 형식으로 표시한다. 클릭하거나 Enter/Space로 열면 다음을 보여준다.

- 문서 제목
- 문서 종류
- source date / effective date
- 공식 URL
- 해당 branch에서 인용된 문구

URL이 null이면 링크 control을 만들지 않는다. 근거번호는 snapshot 내부 참조번호이며 법령번호나
문서관리번호로 표현하지 않는다.

## Required copy

상단 설명:

> 사규예고가 다룬 규정과 업무를 공식 자료에 따라 시간순으로 확인합니다. 확인된 자료가 이어지는
> 지점까지만 표시하며, 다음 관계를 확인할 수 없는 구간은 연결하지 않습니다. 각 단계의 근거문서와
> 추적이 멈춘 이유를 함께 제공합니다.

주의문:

> 현재 업무분장에서 같은 업무가 확인된다는 사실과, 과거 조직에서 현재 조직으로 공식 이관됐다는
> 사실은 다릅니다. 공식 변경 문서가 없는 구간은 연결하지 않습니다.

`data_literacy`의 설명은 용어를 클릭했을 때 해당 용어 바로 아래에 펼친다. tooltip hover만으로
제공하지 말고 키보드 접근과 닫은 뒤 초점 복귀를 지원한다.

## Visual rules

- `OFFICIAL_DOCUMENT`, `EXISTING_ASSERTION`: 실선
- `TEXT_COMPARISON`: 점선 또는 독립 대조 블록
- gap: 선 없음 + `근거사슬 단절` 블록
- `FUNCTION_MULTIPLE_CANDIDATES`: 오류/모호 badge 금지, endpoint를 모두 병렬 표시
- `CURRENT_FUNCTION_OBSERVED`: `현행 업무분장까지 확인`
- `OFFICIAL_TRANSFER_PATH_VERIFIED`: `공식 이관 경로까지 확인`

## Security and semantics gate

다음 field 또는 join을 추가하면 안 된다.

- raw department label, comparison label, PERSON alias
- residual/label/core UUID
- 사람→조직·부서·직무 관계
- candidate score를 확정도처럼 표시
- 하나의 대표 current organization 자동 선택
- gap을 건너뛴 animation
- 기존 PERSON snapshot과 branch endpoint의 client-side join

공개 snapshot 검사 결과는 PERSON→ORG 공개 relation 0건이다.

## CSV

- branch CSV: 1,272행 grain
- endpoint CSV: branch + organization + basis grain
- backlog CSV: evidence need 677행 grain

CSV에도 PERSON/표기/내부 ID를 추가하지 않는다. 화면 필터 결과와 CSV 조건을 동일하게 유지한다.

## Expected verification

- `pnpm check:work-trace-public`
- `pnpm check`
- `pnpm test`
- 1440px / 800px 실제 브라우저
- 세 탭에서 같은 branch 수와 outcome 합계 사용
- evidence 번호의 broken reference 0
- gap인데 선으로 연결된 branch 0
- 복수 대응에서 대표 조직을 선택한 branch 0
- PERSON 별칭·조직 결합 0

## Decision history

| Date | Decision |
|---|---|
| 2026-10-04 | runtime public RPC 대신 validated run 기반 정적 snapshot을 사용한다. |
| 2026-10-04 | 공개 A축은 PERSON 보호를 위해 표기별 조직 집계가 아니라 사규예고별 증거사슬로 고정한다. |
| 2026-10-04 | Manus는 데이터 판정을 재계산하지 않고 snapshot의 A/B/C projection과 evidence dictionary만 렌더한다. |
