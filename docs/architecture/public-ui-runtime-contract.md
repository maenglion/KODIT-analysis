# 공개 UI와 정적 실행 경계

## Status

- 2026-10-02 UI 구현 기준. 기준 commit: `b5bbd33`.
- 공개 사이트의 주 실행 경로는 승인된 정적 snapshot이다. 조직·잔차 관련 의미 계약은 변경하지 않는다.
- 2026-10-03 사용자 요청으로 [PR #2](https://github.com/maenglion/KODIT-analysis/pull/2)를 `main`의 `ebe1904`로 병합했다. 기존 Git 연동 운영 URL에서 새 UI 반영을 확인했다.

## Purpose

피그마 `letscheck-SINBO`의 1차 정보 메뉴, 규정 목록 및 통계 화면을 완성하면서 공개 사이트의 가용성을 데이터 API 장애와 분리한다. 공개된 수치가 서로 다른 승인 시점·계약에서 왔을 때 동일한 실시간 집계처럼 보이지 않게 한다.

## Canonical sources

- 규정 목록·사규예고·부서 및 잔차 화면: `apps/public-site/data/public-snapshot-v1.json.gz` (`evidence_as_of=2026-09-13`, 생성일 2026-09-14). 기존 승인본을 재집계하거나 교체하지 않는다.
- 투자·보증 주제 화면: `reports/measurements/2026-09-19-topic-membership-v2/{summary,member-review}.json`에서 공개 필드만 복사한 별도 정적 파일. `topic-membership-v2`의 투자·자본성 금융 관련 승인 9개 family와 `DISTINCT notice_id` 기준 62건이다. 2026-09-19 주제 측정치를 2026-09-13 규정 snapshot의 하위 집계로 표시하지 않는다.
- 주제 분류 의미·중복 규칙: `docs/architecture/topic-analysis-contract.md`, `config/topic-membership-v2.json`.
- UI 화면 참조: [피그마 `페이지 기획`의 `letscheck-SINBO` 프레임](https://www.figma.com/design/8y8T16UoFNxl47kuT8C2dO/%ED%8E%98%EC%9D%B4%EC%A7%80-%EA%B8%B0%ED%9A%8D?node-id=8-11). 미완성 시안은 자료의 의미 계약과 접근성을 해치지 않는 범위에서 보완한다.

## Decisions and invariants

1. 공개 사이트의 초기 규정 렌더링·검색·통계·CSV는 Supabase RPC 호출을 요구하지 않는다. 2026-10-03 사용자 요청으로 **자동수집 상태만** 기존 공개 RPC를 서버에서 읽는 예외를 둔다. 조회 실패는 상태 표시만 확인 불가로 바꾸고 승인 정적 자료의 로딩·집계·CSV에 영향을 주지 않는다. 외부 검증과 증빙을 위한 기존 RPC, migration, 검사 스크립트 및 계약은 **삭제하거나 대체하지 않는다**.
2. 주제별 숫자는 `topic-membership-v2`의 기록된 측정값으로 표시한다. 소송과 투자·보증의 대분류, 9개 하위군, 사규예고 중복 집계, '선정 업무 키워드'와 직접 해소된 조직 수를 혼동하지 않는다. `보증 OR 투자` 문자열만으로 주제 회원을 새로 만들지 않는다.
3. 주제 화면의 각 공식 게시물 링크는 유효한 공개 URL에 한정한다. 2026-09-19 주제 통계와 2026-09-13 규정 검색을 상호 연결할 때 별도 기준일을 안내한다.
4. 상단 1차 정보 메뉴의 목적·방법론·기술 설명은 확인된 설계와 공개 자료 범위 안에서 작성한다. 법적 확정, 개인 평가, 수치의 실시간성, 이름이 확인되지 않은 담당 조직을 주장하지 않는다.
5. 홈과 내비게이션, 버튼, 검색, 다운로드, 상세 설정은 같은 파란색 계열의 토큰·초점·호버 상태를 사용한다. 모바일에서 전체 사이트를 숨기지 않으며 표와 잔차의 상세 근거는 필요하면 가로 스크롤로 보존한다. 2026-10-03 시안 재검토 후 본문은 KoPub World 돋움 Medium/Bold 웹폰트, 일부 제목만 Paperlogy로 제한한다. 사용자가 KODIT의 KoPub 웹서비스 임베딩 승인을 확인했으며 공식 2026 TTF 원본만 바이트 변형 없이 사용한다.

## Non-goals and known gaps

- DB 스키마·RPC 갱신, live 데이터 재수집, 기존 규정 공개본의 승인·승격은 이번 UI 변경에 포함하지 않는다.
- 주제 통계와 규정 snapshot은 서로 다른 기준일에 고정되어 있다. 동일한 공통 release로 합산하거나 현재 최신값으로 표현하지 않는다.
- 공식 게시판 URL이 게시물 고유 URL이 아닌 경우 연결의 정확도를 확대 해석하지 않는다.

## Related paths

- `apps/public-site/app`, `apps/public-site/data`, `packages/common/src/regulations`
- `tools/publish/build_topic_public_snapshot.mjs`
- `docs/architecture/topic-analysis-contract.md`

## Decision history

| 일자 | 결정 |
| --- | --- |
| 2026-10-02 | 공개 UI는 RPC 장애와 분리된 정적 승인본으로 실행하고, 검증·증명용 RPC 계약은 보존한다. 상단 1차 메뉴 및 누락 주제 화면을 검증된 공개 자료와 별도 기준일 표기로 보완한다. |
| 2026-10-02 | 전체 통합검색의 첫 50건 뒤 결과 접근 불가를 규정·예고 독립 페이지 이동으로 해소한다. 무동작 상세설정 버튼은 제거하고, 공개 집계 CSV와 도움말 버튼은 실제로 동작시킨다. 조직·잔차의 계산 및 확정 규칙은 유지한다. |
| 2026-10-02 | 모바일에서 앱 전체가 숨겨진 기존 규칙을 수정하고, 390px에서 홈·규정·주제·목적·조직 화면의 문서 가로 넘침이 없는지 검사한다. 기술 사양 3개 runner 파일의 표시 해시와 마지막 변경일을 실제 커밋 파일로 정정한다. `check-approved-releases`는 과거 브라우저 RPC 기대 대신 정적 공개 로더를 검사하되 RPC 권한·불변성 검사를 유지한다. |
| 2026-10-02 | 상단 1그룹 세 페이지를 수집 목적·판정 단위·원장·실제 parser 측정 로그로 확장한다. 제공된 잔차 ERD 162줄을 수정 없이 Mermaid 원본으로 보존하고 19개 엔티티 SVG로 렌더링해 확대 뷰어로 제공한다. 코드·실행 환경·공개본 기준일을 구별하고 내부 실행 ID나 개별 문서 해시 값은 화면에 노출하지 않는다. 기존 Git→Netlify 연결을 유지하며 별도 영구 호스팅을 만들지 않는다. |
| 2026-10-03 | 저장소 소유자 `maenglion` 계정으로 GitHub 인증을 전환해 [PR #1](https://github.com/maenglion/KODIT-analysis/pull/1)을 `main`의 `e961745`로 병합했다. 기존 Git 연동이 배포한 운영 주소에서 새 방법론·parser 기술 사양·ERD SVG의 HTTP 200과 콘텐츠를 확인했다. Netlify API·설정은 직접 변경하지 않았다. |
| 2026-10-03 | 제공된 HOME 전체규정·상세설정·수집목적·부서통계 시안을 재검토했다. HOME을 중간 랜딩 카드 대신 승인된 전체규정 목록으로 전환하고 상단 메뉴에서 직접 규정·예고·정보 페이지로 이동한다. 검색은 입력 즉시 반응 대신 버튼/Enter 제출 후 적용하며 상세 설정은 실제 폼을 열고 적용·초기화한다. 1,165줄 누적 CSS의 상충 규칙을 제거하고 전역/규정/조직/잔차/주제/정보/상세 화면별 스타일로 분리한다. 조직 통계의 계산 로직과 승인 공개 자료는 변경하지 않는다. |
| 2026-10-03 | 실제 parser 코드·재현 로그·이전 환경 실패를 대조해 형식별 처리 단계와 결론 경계를 `parser-operation-review-20261003.md`에 기록했다. 공개 기술 사양에는 4,828회 재현 시도와 2,414회 별도 원장 적재를 분리해 표시하며 신원 미해결 33건과 PDF 읽기 실패 10건을 합산하지 않는다. 문서별 로그는 서버용 원장에 남기고 브라우저에는 집계만 투영한다. |
| 2026-10-03 | 사용자가 KoPub World의 KODIT 웹 임베딩 승인을 확인했다. 한국출판인회의 공식 TTF 묶음에서 돋움 Medium/Bold만 선택하고 포맷 변환·서브셋·글리프 수정 없이 원본 바이트 그대로 호스팅한다. Paperlogy는 일부 제목에 한정한다. |
| 2026-10-03 | 중복 HOME 메뉴를 제거하고 `/`를 `/regulations`로 리디렉션한다. 담당 표기 잔차는 부서 화면에서 독립한 `/residual-data`로 승격한다. 768~1296px 웹 레이아웃을 유지하고, 모바일에서는 768px 태블릿 폭의 웹 화면을 가로로 볼 수 있게 하되 세션당 한 번 PC·태블릿 최적화 안내를 보여 준다. 다른 모바일 앱 UI는 만들지 않는다. |
| 2026-10-03 | 조직 히스토리의 2024-04-24, 2026-01-29 경로는 개인정보보호 **기능 이관**만 뜻한다. 2026 현행 조직명이나 사규예고 제목만으로 신설·전체 조직 승계를 주장하지 않는다. 기존 사규예고·공개 시행본은 유형·연도로 찾아보되 신설조직 탭은 근거 미확정 안내를 보여 준다. 부서 위의 `부서 목록`은 ㄱㄴㄷ 검색 모달로 열고 하단으로 강제 이동하지 않는다. |
| 2026-10-03 | Codex가 확인한 현재 원장에는 규정 버전 단위 `검증 중단`/`검증 불가` 판정·공개 필드와 크론별 변경이력 공개 계약이 없다. PDF/HWP(X) 실행 실패는 그 상태로 자동 승격하지 않으며, 미래전략실 목업의 `검증 중단·불가(2)`는 재현 불가다. 예약 탭의 안내/도움말만 유지하고 수치·배지·변경이력 0건을 표시하지 않는다. |
| 2026-10-03 | 사용자의 운영 반영 요청에 따라 검증된 [PR #2](https://github.com/maenglion/KODIT-analysis/pull/2)를 `main`에 merge commit `ebe19040d8ea88fe59c91b339b772c927b73e8c8`로 병합했다. 기존 Git→Netlify 자동 배포에서 `department-statistics`, `residual-data`, 13px ERD SVG를 확인했다. Netlify API/설정에는 직접 변경을 가하지 않았다. |
| 2026-10-03 | 사용자가 `/data-purpose`의 원고를 전면 교체하고 페이지 자체의 후속 수정 이력을 `변경이력(0)`으로 시작할 것을 요청했다. 제출 Markdown을 단일 정본으로 보존하고 이 페이지의 도식·4개 카드·하단 홍보 블록을 제거한다. 여기서 **0건은 기준본 이후 안내문 편집 건수만** 뜻하며 앞서 확인된 크론/규정 변경이력 미제공 상태를 수정하거나 그 데이터가 0건이라고 주장하지 않는다. |

## Editorial manuscript baseline (2026-10-03)

- `apps/public-site/content/data-purpose.md`는 사용자가 제공한 원고의 제목, 전체 3장·8개 소제목, 표 2개, 문단·목록과 관련 페이지 이름을 그대로 유지한다. 사용자 원고의 `자료 기준 · 2026-09-13`, `설명 검토 · 2026-10-02`는 임의로 변경하지 않는다. 화면에서는 관련 페이지 이름에 내부 링크만 부여한다.
- `apps/public-site/data/data-purpose-history.json`의 `baselineSha256`은 기준 원고의 SHA-256, `revisions=[]`는 기준본 **이후** 수정 이력 0건이다. 후속 편집은 `node tools/check-data-purpose-content.mjs --record "수정 내용 요약"`으로 날짜·요약·새 해시를 기록한다. 웹사이트 빌드가 원고와 마지막 해시의 일치를 확인하므로 기록되지 않은 수정은 게시할 수 없다.
- 이 이력은 안내 페이지의 편집 추적용이지 `publish.regulation_changes` 또는 크론 수집·비교 결과가 아니다. 규정 변경 행을 이 숫자에 합산하지 않는다. 목적 페이지에서 제거한 `purpose-flow.mmd`와 해당 SVG 외에는 다른 방법론·기술 사양 다이어그램을 유지한다.
- 첨부 원고와 정본 Markdown의 개행 정규화 후 6,839바이트가 동일한지 확인했다. 원고만 임시 변경하면 검사 실패, `--record` 실행 후 검사 통과·수정 이력 1건, 기준본 복원 후 이력 0건으로 돌아오는 것을 재현했다. `pnpm check:purpose`, 규정·기술사양 계약 검사, TypeScript 검사, 프로덕션 빌드, 패키지 테스트를 통과했다.
- Chromium에서 `/data-purpose`의 3개 장, 표 2개, 소제목 8개, 관련 페이지 링크 4개를 1440/800/390px에 표시했다. 첨부 문장 전체의 표시값을 대조하고 도식·4개 카드·홍보 블록 부재, 첫 장 제목 오른쪽의 `변경이력(0)` 펼침을 확인했다. 다른 `/methodology`·`/technical-specs`의 다이어그램은 계속 로드된다.

## Department and organization evidence (2026-10-03)

- 공개본 `apps/public-site/data/public-snapshot-v1.json.gz`의 미래전략실은 사규예고 10건, 연결 규정 버전 6건, 전문 공개 0건, 6개 모두 `NOTICE_ONLY`이다. 이는 규정 검증 중단·불가 판정이 아니다. 전문 확보율은 연결된 고유 규정 버전 중 `FULLTEXT_PUBLIC` 개수/고유 버전 수이며, 동일 버전의 PDF·HWP·HWPX·HTML 공식 표현물 하나가 검증된 전체 본문을 제공해도 해당 판정을 허용한다. 파서 성공만으로 전문 공개나 현행 효력을 확정하지 않는다.
- `core.parser_runs.parser_result`, `failure_domain`, `failure_code`, `extraction_id`는 **파일 실행 결과**이고 규정 버전의 `검증 중단`/`검증 불가` 필드가 아니다. 전문 미공개·DRM·출처불명을 두 상태로 역산하지 않는다. UI의 검증 지표는 숫자 대신 `—`(현재 집계 미제공), 별도 탭에서는 후속 공개 범위라고 설명한다. 도움말 문구는 확정 상태 정의가 아닌 *향후 도입 가능 용어*로 명시한다.
- `publish.regulation_changes` 두 승인 공개본은 각각 변경행 0개지만 incremental release 비교·적재 자체가 수행되지 않았으며, public change RPC/snapshot의 changes 배열도 없다. 크론별 변경 없음/기간 중 변경 0건으로 표시하지 않고 후속 공개 단계(수집 완료→승인본 비교→버전별 NEW/UPDATED/REMOVED→공개 투영)를 설명한다.
- 공식 조직 근거 `tools/organizations/organization-v1.json`과 개인정보 처리방침 변경이력은 `리스크관리실 → 리스크준법실(2024-04-24) → 안전전략실(2026-01-29)`의 **개인정보보호 책임·담당 기능 이동**만 뒷받침한다. 직제규정에서 새로 관측된 노드는 신설 이벤트가 아니며 `CREATED` 0건, 법령 조항 미확정이다. `tools/publish/build_public_organization_history.mjs --check`가 이벤트 2건·조직 관련 사규예고 52건·현행 공개 규정 3건·보존 시행 문서 31건·확정 신설조직 0건을 확인한다. 연도 클릭 경로의 점/기능 라벨만 이동시키고 조직 전체 승계로 보이게 하지 않는다.
- 제공된 원장 ERD Mermaid 정본은 바꾸지 않고 전체 ERD 테마 15→13px, 작은 흐름도 16→14px로 재렌더링한다. 원본 SVG를 새 창에서 열고 확대/축소할 수 있다. 화면 상한 1296px, 모바일 웹 레이아웃 하한 768px을 적용한다.

## Verification (2026-10-02)

- `pnpm --filter @kodit/public-site check`, `pnpm --filter @kodit/public-site build`, `pnpm check`, `pnpm check:regulations`, `pnpm check:technical-specs`, `pnpm check:approved`, `pnpm check:residual-analysis`, `pnpm check:t07c`, `pnpm test`: 통과.
- 390px 브라우저에서 5개 공개 경로가 모두 HTTP 200, 앱 표시 및 전체 문서 가로 넘침 없음. 주제 하위군 33건 필터와 제목 검색 5건, 규정 용어 펼침, 통합검색 규정·사규예고 51번 항목 이동 확인.
- 서비스별 독립적인 시점과 원문 식별 정보는 아직 통합 승격하지 않았다. 이력 검토 후 필요한 경우 별도 공개본으로 다룬다.

## Information-page evidence (2026-10-02)

- `reports/measurements/2026-09-13-runtime-v1-reproduction/{hwp,hwpx}/batch-run.json`: HWP 326건(추출·신원 확인 298, 신원 미해결 28), HWPX 358건(353, 5). 각 입력 두 번 재현했고 parser 실패 0건, 추출 해시 이상 0건이다. 신원 미해결은 parser 실패가 아니다.
- `reports/measurements/2026-09-13-pdf-full-corpus/batch-run.json`: strict PDF 1,730건 중 SUCCESS 1,719, NO_EXTRACTABLE_TEXT 1, DOCUMENT/PDF_READ_FAILED 10. 개별 PDF의 기술 결과는 규정 버전의 공개 availability를 변경하지 않는다.
- `reports/measurements/2026-09-17-document-extraction-backfill/summary.json`: 2,414 parser run, 2,408 고유 바이너리, 2,397 고유 추출 artifact. 화면 자료는 `tools/publish/build_public_parser_measurements.mjs`에서 검증·공개 필드 투영 후 생성하며 내부 원장의 행별 값은 브라우저에 싣지 않는다.
- 축약 흐름도 4개와 제공 ERD 1개는 `apps/public-site/data/diagrams/*.mmd`가 재현 가능한 원본이고 `apps/public-site/public/diagrams/*.svg`가 공개 화면 자산이다. 큰 ERD는 기본 화면에 축소 미리보기로만 놓고 확대·원본 크기·SVG 새 창 보기를 제공한다. 텍스트 설명이 도식의 유일한 대체 수단이 되지 않도록 각 영역에 설명을 함께 둔다.
- 초기 연결 계정 `simulacre-8`은 `maenglion/KODIT-analysis`에 대한 push 권한이 없어 2026-10-02 검수 단계에서 403이었다. 2026-10-03 `maenglion` 계정 인증으로 해결했고, PR #1 병합 후 기존 운영 주소 `https://letscheck-sinbo.netlify.app`에서 신규 페이지와 ERD를 확인했다.

## UI·parser verification (2026-10-03)

- `pnpm check`, `pnpm check:approved`, `pnpm check:regulations`, `pnpm check:technical-specs`, `pnpm check:residual-analysis`, `pnpm check:t07c`, `pnpm test`, `pnpm --filter @kodit/public-site build`: 통과. 공개 parser 집계는 재현 로그·원장 요약과 byte-for-byte 일치하며 두 공식 KoPub TTF의 SHA가 원본과 같다.
- 1440px 시안 비교에서 헤더 높이 219px, HOME 검색 상단 584px, 상단 정보 페이지의 첫 카드 상단 465px 확인. 390/768/1440px의 HOME·목적·기술 사양·부서·주제 화면에서 문서 가로 넘침 없음.
- 실제 Chromium에서 KoPub 400/700 로딩, 입력만으로 검색 결과가 바뀌지 않다가 검색 제출 후 4건 표시, 사규예고 탭에서 2,089건 표시, HOME 복귀, 전문 공개 필터 205건, parser 단계 펼침, 잔차 ERD 대화상자 열림을 확인했다.
- 기존 승인 공개본, 수집/DB 권한, 조직·잔차 판정 로직, Netlify API와 설정은 변경하지 않았다. 사용자가 중간 검수를 마치기 전에는 새 변경을 운영 `main`에 병합하지 않는다.

## Department UI release verification (2026-10-03)

- PR #2의 5개 GitHub/Netlify 검사에서 Header rules, Redirect rules, deploy-preview는 SUCCESS, Pages changed는 NEUTRAL, Supabase Preview는 SKIPPED였다. PR의 마지막 head `4cd30b0`에서 타입·빌드와 `pnpm check`, `check:approved`, `check:regulations`, `check:technical-specs`, `check:residual-analysis`, `check:t07c`, `pnpm test`, 조직 공개 이력 `--check`를 통과했다.
- Netlify PR 미리보기에서 실제 Chromium으로 1440/800/390px의 부서 목록 ㄱㄴㄷ 모달, 미래전략실 연결 규정 6건, 검증 상태 미제공 도움말, 연도별 기능 이동, 신설 확정 미제공, 새 잔차 경로, 모바일 PC 안내를 확인했다. 기존 규정·사업별 통계·상단 정보 3페이지도 800px에서 HTTP 200과 ERD 로딩을 확인했다.
- 운영 [KODIT 공개 사이트](https://letscheck-sinbo.netlify.app/)에서 병합 약 90초 뒤 `/department-statistics`의 기능 이동 UI, `/residual-data`의 독립 잔차 화면, `/diagrams/residual-ledger-erd.svg`의 13px 서체가 실제 제공됨을 확인했다. 이는 기존 Git 기반 자동 배포이며 별도 호스팅 생성이나 Netlify 설정 변경이 아니다.

## Editorial navigation follow-up (2026-10-03)

- 사용자가 승인한 [PR #3](https://github.com/maenglion/KODIT-analysis/pull/3)을 `main`의 merge commit `e1fae13`로 병합했다. 기존 Git 연동 운영 주소의 `/data-purpose`에서 새 원고가 병합 약 26초 뒤 제공됨을 확인했다. Netlify API·설정은 직접 변경하지 않았다.
- 방법론·기술 사양 페이지 하단의 ‘자료와 근거를 함께 보세요’ 홍보 블록은 원고 페이지의 간결한 ‘관련 페이지’ 링크 목록처럼 교체한다. 목적 원고의 본문·수정이력은 바꾸지 않는다.
- `/residual-data` 안내에서는 사규예고 담당 표기와 당시 기준 조직명의 exact match 실패로 잔차가 생성되는 점, 이후 라벨 분류·공식 조직 근거·업무 경로 평가·미확정 보존 과정을 구분해 설명한다. 원장의 관계를 확인하는 링크는 `/methodology#residual-ledger-erd`로 직접 이동하며, 기존 ERD의 판정 데이터나 관계는 수정하지 않는다.
- 부서 요약의 지표 도움말은 테두리 있는 원형 글리프 `ⓘ`를 다시 원으로 감싼 이중 아이콘 대신 단일 테두리 `i`를 사용한다. 긴 요약 아래의 시맨틱·조직 앵커를 `/department-statistics/semantic-matching`과 `/department-statistics/organization-history`의 독립 페이지로 분리하지만, 공개 플래그 원천·기능 이관 경로·신설 미확정 상태는 그대로 유지한다. 시맨틱 페이지의 공개 상태 건수는 승인본의 전체 규정 버전 범위로 표시하고 부서 선택 집계와 섞지 않는다.
- 사업별 통계는 내부 긴 페이지 대신 `/investment-statistics`(요약), `/investment-statistics/yearly-notices`(게시일 연도 분포), `/investment-statistics/evidence-notices`(승인된 근거 목록)로 분리한다. 하위군 카드와 연도 링크가 근거 목록의 URL 필터를 전달하고, CSV는 현재 필터 결과만 내려받는다. 2026-09-19 주제 승인본은 변하지 않으며 2026-09-13 규정 공개본과 합산하지 않는다. 근거 CSV의 버튼은 기존 규정 CSV와 같은 녹색 테두리·녹색 글씨로 표시한다.

### Follow-up validation

- `pnpm --filter @kodit/public-site build`가 신규 정적·동적 경로 전체에서 성공했고, `pnpm check`, `pnpm check:purpose`, `pnpm check:approved`, `pnpm check:regulations`, `pnpm check:technical-specs`, `pnpm check:residual-analysis`, `pnpm check:t07c`, 조직 이력 투영 `--check`, `pnpm test`를 통과했다.
- 실제 Chromium 1440px/800px에서 부서 3개·사업 3개 URL의 활성 메뉴와 레이아웃을 확인했다. 부서 정보 버튼 7개의 단일 원형과 툴팁, 2026 기능 이동, 요약 하위군 클릭→근거 33건, 연도 클릭→해당 연도 목록, 잔차 설명→방법론 ERD 해시 링크가 정상이다. 390px에서는 PC·태블릿 최적화 모달을 닫은 뒤 768px 웹 레이아웃과 독립 URL 이동을 확인했다.
- 근거 CSV는 필터 결과 33행과 헤더 1행, UTF-8 BOM 바이트 `EF BB BF`, 승인 하위군 표기를 확인했다. 녹색 보더 `#239638`과 진녹색 텍스트 `#217a39`/흰 배경(계산 대비 5.37:1)을 검증했다. 방법론·기술 사양 하단의 `관련 페이지` 링크만 보이는 실제 화면을 확인했고, 옛 홍보 문구는 나타나지 않았다.

### Independent review corrections

읽기 전용 독립 검토에서 선택한 하위군의 표시 결과를 초기 URL에 반영하지 않아 공유·새로고침 시 필터가 되돌아가던 문제와, 상위 섹션·하위 페이지를 동시에 `aria-current="page"`로 안내하던 문제를 확인했다. 하위군 선택·해제 시 `topicEvidenceUrl`의 정규화된 경로를 `history.replaceState`와 즉시 표시 상태에 함께 적용하고, 연도 해제 링크는 선택한 하위군만 유지한다. 부서·사업의 상위 메뉴는 시각 강조만 유지하고 하위 메뉴 한 곳만 실제 현재 페이지를 선언한다. 승인된 62건과 원본 CSV 데이터는 바꾸지 않았다. 필터·연도·URL·CSV 문자열 변환을 순수 함수로 분리해 기존 규정 UI 계약에서 실제 주제 스냅샷의 건수·BOM·행 수·해제 URL을 검사하도록 보강했다.

### PR #4 운영 반영 (2026-10-03)

사용자가 중간 검수 후 푸시를 요청하여 [PR #4](https://github.com/maenglion/KODIT-analysis/pull/4)를 검사를 통과한 head `ea2707129a710838b3802a9a6acf6e28476e0d03`으로 고정해 `main`의 merge commit `a9a236bd24cd291906dde4d301cd2e0ef9ce21d8`에 병합했다. 기존 Git→Netlify 자동 배포 약 37초 뒤 운영 주소 `https://letscheck-sinbo.netlify.app`에서 독립 시맨틱 매칭·조직 히스토리·사업 근거 사규예고 경로가 모두 HTTP 200이고 해당 페이지 콘텐츠를 제공함을 확인했다. Netlify API·설정은 직접 변경하지 않았다. 원고 페이지 PR #3의 본문과 수정이력 0건, 기존 공개 스냅샷 및 Supabase 데이터 계약은 그대로 유지한다.

### 잔차 표기 상세 위치 보완 (2026-10-03)

사용자 피드백에 따라 `/residual-data`의 사람형 잔차 이름을 포함한 모든 공개 표기 클릭 결과를 표 **아래**에서 검색·분류 제어와 표 **사이**의 상세 패널로 이동했다. 이름을 누르면 선택 행을 강조하고 `aria-expanded`/`aria-controls`로 상세를 연결한 뒤 상세 패널로 초점·스크롤을 이동한다. 같은 이름을 다시 누르거나 닫기 버튼을 누르면 접히고, 분류·검색 변경으로 선택 표기가 목록에서 사라지면 열린 상세와 게시물 선택을 함께 정리한다. 원장 데이터, 공개 마스킹, 인물 신원 미확정 문구와 추론 계약은 변경하지 않았다. 실제 Chromium 1440px와 800px에서 인물형 표기 선택→상단 패널 표시·초점·스크롤·선택 행·닫기·필터 변경 후 접기와 문서 폭 유지를 확인했다. 운영 잔차→방법론 ERD 링크도 경로 전환 뒤 DOM 표시를 기다리면 정상 로드되어, 즉시 검사에서의 실패는 로딩 시점 차이였음을 확인했다.

### 잔차 상세 운영 반영 (2026-10-03)

검증된 [PR #5](https://github.com/maenglion/KODIT-analysis/pull/5)를 `main`의 merge commit `873772ba9bfb5d2f25f369cbe26d19bb2df5dd58`로 병합했다. 기존 Git→Netlify 자동 배포에서 약 80초 뒤 운영 `/residual-data`의 사람형 공개 표기를 누르면 상세가 목록 위에 열리고 초점·스크롤·선택 행 및 검색 후 접기가 정상 작동함을 Chromium 1440px·800px에서 확인했다. PR 배포 미리보기의 800px 검사에서는 Netlify의 고정 검수 툴바가 화면 맨 아래 첫 표 행을 가려 최초 자동 클릭이 빗나갔으며, 행을 화면 중앙으로 스크롤해 다시 검사하자 두 뷰포트 모두 통과했다. 운영 사이트에는 해당 툴바가 없고 코드·CSS를 그 툴바에 맞춰 변경하지 않았다. Netlify API·설정은 직접 변경하지 않았다.

### PERSON 공개 별칭 및 문의 채널 (2026-10-03)

- Codex가 `43148af`에서 공개 read contract·DB migration·승인 정적 snapshot과 공급 검증을 별도 커밋으로 먼저 `main`에 반영했다. Manus는 이 최신 `main`을 받은 뒤 UI 소관 원고·편집 이력·공통 표시/CSV 헬퍼·잔차 컴포넌트/CSS와 해당 UI 회귀 검사만 수정한다. migration, read contract, snapshot, 공급 검증은 재작성하지 않는다.
- 공개 PERSON 표기는 공급된 `^[ㄱ-ㅎ]+\(\d{4}\)$` 값만 목록·검색·상세·관측 경로·CSV와 접근성 텍스트에 그대로 사용한다. UI는 원문 이름이나 `label_id`로 초성·번호를 만들지 않고, 별표 마스킹·원문 성명·`인물(0000)`과 같은 계약 외 값을 만나면 출력 전에 차단한다. 괄호 안 숫자는 직원번호/사번이 아니라 공개용 결정적 별칭이다. 내부 원문과 canonical PERSON 식별자는 변경하지 않았다.
- 사용자 요청대로 안내 원고 3.2의 문의 채널을 맹난영, `nanyoung@soulspectrum.kr`, 카카오톡 `@soulspectrum`으로 확정하고 별도 개인정보 담당자 항목을 표기하지 않는다. 기존 기준본 이후의 첫 편집 이력으로 기록하며 규정·수집 데이터의 변경 이력과 혼동하지 않는다.

검증: Codex 공급 snapshot의 PERSON 라벨 317개·관측 1,113건과 해당 설명 1,113건이 모두 같은 공개 별칭을 사용하고, 별칭 번호 충돌은 0건이었다. UI 공통 표시 함수와 관측/표기 CSV가 동일 값을 변경 없이 반환하는지 전체 공개 행으로 비교했다. `pnpm check:purpose`, `pnpm check:regulations`, 전체 타입 검사·승인 공개본/잔차/기술사양/T07C 검사, `pnpm test`, Next 프로덕션 빌드를 통과했다. 실제 Chromium 1440px·800px에서 문의 메일 링크·카카오톡 표기·편집 이력 1건과 PERSON 목록 317건·번호 검색·상단 상세·두 CSV·근거 설명을 확인했다. 독립 검토에서 별도 개인정보 담당자에 대한 원고 문장을 제거하고 앞뒤 공백을 포함한 계약 외 별칭도 차단하도록 수정했다.

### PR #6 운영 반영 및 별도 데이터 검사 상태 (2026-10-03)

사용자가 검수본 운영 반영을 승인하여 [PR #6](https://github.com/maenglion/KODIT-analysis/pull/6)의 고정된 UI head `9f796e9f1bb0ba9ffcf9d15e241a8a3dc4db26f0`을 merge commit `c3c4824298a67f4a45a87386e916b2d25d95856d`로 `main`에 병합했다. 기존 Git→Netlify 자동 배포가 제공하는 [운영 목적 페이지](https://letscheck-sinbo.netlify.app/data-purpose)와 [잔차 페이지](https://letscheck-sinbo.netlify.app/residual-data)에서 Chromium 1440px·800px로 문의 채널·편집 이력 1건, PERSON 공개 별칭 목록 317개·검색·상단 상세·근거·두 CSV를 검증했다. 운영 목적 HTML과 PR #6 미리보기 HTML도 동일했다. Netlify 설정/API는 직접 변경하지 않았다.

별도 GitHub `Supabase Preview` 검사는 Codex 선행 커밋 `43148af`와 이번 merge commit 모두에서 `SQLSTATE 42723: function "public_department_attribution_explanation_rows" already exists with same argument types`로 실패한다. 정적 운영 화면 검증 통과와 이 migration 재생 오류를 혼동하지 않으며, DB migration/공개 read contract 소유자인 Codex가 별도 해결할 문제로 남긴다. Manus는 해당 migration·snapshot·Supabase 설정을 수정하지 않았다.

### 잔차 목록 제어·행 내부 상세 재구성 (2026-10-03, 검수 전)

- `/residual-data`는 승인 정적 snapshot **표기 355개·관측 1,272건**을 그대로 소비한다. 검색 상자 대신 목록 표시명/관련 사규예고 건수 정렬과 표 머리의 관측 분류 **복수 체크박스**를 제공한다. 10개 단위 페이지, 전체/필터 후 표기 수·관련 관측 건수 및 현재 페이지를 표시한다. 이전 목록 위 공용 상세 패널은 사용자 스크린샷의 맥락을 따라 **클릭한 표 행 바로 다음 행**의 펼침으로 바꾼다. 선택 표기의 실제 연결 게시물 건수를 표시하며 날짜는 한 줄, 처리 상태는 절제된 단일 파란 칩으로 정리한다. 필터 CSV는 현재 화면의 10행이 아니라 **필터 전체 표기 및 해당 연결 관측 전체**를 각각 내보낸다.
- PERSON 표기 317개·연결 관측 1,113개는 Codex 제공 `^[ㄱ-ㅎ]+\(\d{4}\)$` 별칭만 렌더링·내보내고 신원/소속 확정으로 해석하지 않는다. `ORG_CURRENT`/`ORG_HISTORICAL`/`UNTYPED`/`AMBIGUOUS` 등 원장 판정값을 UI에서 재계산·승격하지 않는다. 해당 분류의 처리 기준은 상단 펼침 설명으로 제공한다.
- 현재 공개본 `mention_source_locations` 473개는 고유 URL 5개이며 모두 [신보 공식 사규 제개정 예고 목록](https://www.kodit.or.kr/kodit/na/ntt/selectNttList.do?mi=2812&bbsId=322&listCo=500&currPage=1)의 `selectNttList.do` 1~5쪽이다. 공식 HTML 제목은 `정보공개>사규 공개 및 제개정 예고>사규 제개정 예고`이고 `og:title`은 일반 사이트명 `신용보증기금`이다(1·3쪽 직접 확인). **개별 게시물 원문 URL이나 제목으로 오인하지 않도록** 링크는 페이지 제목 `사규 제개정 예고`로 표시하고 같은 제목이 여러 곳이면 `(1)`, `(2)` 순번을 붙인다. 상세에도 해당 링크가 개별 문서가 아닌 공식 목록 페이지임을 밝힌다. 승인본 이외의 문서 제목/연결을 역산하지 않는다.
- 작업 범위는 공개 UI·스타일·UI 필터/출처 라벨 헬퍼·화면 회귀 검사와 이 문서에 한정한다. Codex 소관 migration·공개 read contract·승인 snapshot·공급 데이터 검증을 건드리지 않으며, 운영 배포는 사용자 중간 검수 전까지 보류한다.

읽기 전용 독립 검토에서 PERSON 선택 게시물에 공통 조직 추론 패널이 열려 `현재 부서 후보`가 공개 별칭에 결합되는 문제를 발견했다. 승인 snapshot의 PERSON 설명 1,113건 중 886건에 해당 후보 필드가 채워져 있음을 재현했다. 이는 신원·소속 비확정 경계와 혼동되므로 **PERSON에서는 조직 후보·업무 경로 패널을 표시하지 않고**, 선택한 사규예고 담당 표기와 다른 문서 본문의 인물형 문자열 관측 사이의 공개 범위만 설명한다. 조직형에는 기존 판정 패널을 유지한다. 이동 근거 `path_steps.evidence_url`도 `validPublicUrl` 검사 후 http/https 링크만 렌더링한다.

Next 정적 페이지가 전체 설명 1,272행을 클라이언트 props로 직렬화하면 PERSON의 비표시 조직 후보도 전송되므로, 공개 페이지 UI 경계에서 PERSON 설명 1,113행을 제외하고 비PERSON 설명 159행만 컴포넌트에 전달한다. 승인 snapshot·공개 read contract는 바꾸지 않는다. 최종 프로덕션 HTML에서 `current_org_candidate`·`masked_label` 필드 출현이 각각 159회인 것을 확인했고, PERSON 화면·CSV 및 조직형 상세/근거 링크의 브라우저 회귀를 다시 통과했다.

최종 검증: `pnpm check`, `check:approved`, `check:technical-specs`, `check:t07c`, `pnpm test`를 먼저 통과했고, 위 보정 후 `check:regulations`, TypeScript, `check:residual-analysis`, Next 프로덕션 빌드 및 `git diff --check`를 다시 통과했다. Chromium 1440/800px에서 안내 여백 32px·상태 제목 파란색·기본 10행/36쪽·복수 분류/페이지 전환·PERSON+과거 조직 319개·필터 전체 CSV BOM/행 수·행 바로 아래 상세와 초점 복귀를 확인했다. 별칭 `ㅇㄷㅎ(8053)`의 실제 연결 게시물 18건, 목록 링크 `사규 제개정 예고 (1)`~`(4)`, 목록 페이지 안내·날짜 한 줄·상태 칩을 확인했고 0건 분류도 안전하게 표시했다. PERSON 게시물 선택 후 조직 후보 그리드가 DOM에 없으며, ORG_CURRENT의 기존 판정·공식 근거와 대화상자 Escape/초점 복귀는 유지된다.

### 잔차 ‘관측 / 게시물 / 본문 언급’ 집계 단위 설명 (2026-10-03, PR #7 후속)

[담당 표기 잔차 원장](../../supabase/migrations/20260917000100_notice_department_residual_occurrences.sql)은 승인 release의 사규예고 `notice_id`별 담당 칸이 기준 조직명과 정확히 일치하지 않으면 잔차 행을 기록한다. 제약 `unique (release_id, notice_id, residual_code)` 때문에 이 분류의 잔차는 **해당 게시물당 최대 1행**이다. [공개 라벨 요약 함수](../../supabase/migrations/20260918000300_department_residual_analysis_read_model.sql)는 라벨별 `count(*)`를 **담당 표기 관측** 수, `count(distinct notice_id)`를 **서로 다른 사규예고 게시물** 수로 반환한다. 현재 승인 snapshot의 355개 표기에서는 두 값이 전부 같지만 서로 다른 집계 단위다.

본문 **mention** 수는 별도로 연결된 `core.extraction_mentions`의 해당 라벨 행 `count(*)`이다. [본문 추출기](../../tools/mentions/mention_extractor.py)는 추출 텍스트에서 발견한 인물형 문자열마다 시작/끝 위치를 남기며, [mention 원장](../../supabase/migrations/20260917000300_extraction_mention_ledger.sql)은 동일 추출 문서·계약·유형·위치의 중복만 제거한다. 따라서 한 추출 문서에서 서로 다른 위치에 반복 등장하면 여러 mention이 될 수 있고, mention 건수는 게시물 수나 서로 다른 문서 수가 아니다. PERSON 공개 별칭 `ㅇㄷㅎ(8053)`의 공개 집계는 **담당 표기 잔차 18행 / 고유 사규예고 18건 / 본문 인물형 언급 24개 위치**다. 이 집계만으로 24개 mention이 위 사규예고 18건에서 각각 몇 번 나왔는지, 또는 차이 6건이 그 게시물의 반복 언급인지 알 수 없다. UI의 항목 이름과 인접 설명만 바로잡고 원장·read contract·승인 snapshot은 그대로 보존한다.

표기 상세의 `관측 / 게시물`을 `담당 표기 관측 / 사규예고`로 구체화하고 바로 아래에 원장 행/중복 제거 게시물의 정의를 배치했다. PERSON의 `mention 관측`도 `본문 인물형 언급`으로 바꾸고 위치별 추출·동일 추출 위치 중복 제거·게시물별 횟수는 공개 집계만으로 확인할 수 없다는 설명을 인접 배치했다. UI 회귀·TypeScript·잔차 공급 계약·Next 프로덕션 빌드 및 Chromium 1440/800px에서 `ㅇㄷㅎ(8053)`의 18/18/24 표시, 필터/CSV/상세 동작을 재검증했다.

### PR #7 잔차 UI 운영 반영 (2026-10-03)

사용자가 `푸쉬해죠`로 운영 반영을 요청해 [PR #7](https://github.com/maenglion/KODIT-analysis/pull/7)의 고정 UI head `35350088f4c9da47431396095eaad4f4cf73b3eb`를 검수한 뒤 `main`의 merge commit `f8ff989843487bc6a126a6ee00cf41c6139a3562`로 병합했다. PR의 Netlify deploy-preview·Header rules·Redirect rules 검사는 성공했고 Pages changed·Supabase Preview는 건너뛰었다. 기존 Git→Netlify 자동 연결이 제공하는 [운영 잔차 페이지](https://letscheck-sinbo.netlify.app/residual-data)에서 `ㅇㄷㅎ(8053)`의 **담당 표기 관측 18건 / 사규예고 18건 / 본문 인물형 언급 24건**과 집계 단위·반복 위치 설명을 실제로 열어 확인했다. Chromium 1440px·800px에서 10개 단위 페이지, 분류 필터·CSV·클릭 행 바로 아래 상세·PERSON 조직 후보 비노출을, 조직형에서는 근거 링크·키보드 조작을 검증했다. Netlify API·설정은 변경하지 않았다.

merge SHA의 별도 `Supabase Preview` 검사는 이전 PR #6 때와 동일한 `public_department_attribution_explanation_rows already exists with same argument types (SQLSTATE 42723)` migration 재생 오류로 실패 상태로 남았다. 이는 정적 사이트의 확인된 운영 화면과 다른 검사이며 Codex 소관 migration·공개 read contract·승인 snapshot에 손대지 않았다. 본 기록만 추가하는 후속 커밋은 UI/데이터를 변경하지 않는다.

### 규정 상세설정·요약 및 자동수집 상태 분리 (2026-10-03, PR 검수 전)

사용자가 제공한 [상세설정 시안](https://www.figma.com/design/8y8T16UoFNxl47kuT8C2dO/%ED%8E%98%EC%9D%B4%EC%A7%80-%EA%B8%B0%ED%9A%8D?node-id=16-3172)을 기준으로 **결과표 아래 버튼을 누르면 검색창과 결과표 사이에 2열 공개 필드 설정표가 펼쳐지게** 재구성했다. 기존 내비게이션은 유지한다. 검색 범위·포함/제외 단어 각 최대 3개·공식 조직명 정확 일치 복수선택·ALIO/KODIT 출처 종류·개정일/최근 연결 예고일/게시일 기간을 UI 전용 필터로 적용하며, 규정과 사규예고 각각의 CSV는 표와 같은 필터의 **전체 결과**를 내려받는다. 실제 공개본에 텍스트가 없는 확보문서/첨부 본문 검색과 공개 매핑이 없는 과거→현재 조직 자동 매칭은 제공하지 않는다. `currentness` 전 행 null과 `partial_*` 전 행 false를 출처 종류 필터로 오인하지 않는다.

규정 목록 앞의 요약은 승인 snapshot의 **규정 버전 1,041건**, `source_kind=ALIO` 근거가 연결된 **서로 다른 규정 버전 205건**(근거 역할은 전문표현물 204건/기타근거 1건), `NOTICE_ONLY` **831건**만 쓴다. ALIO 출처 연결 205를 전문 공개 205와 동치로 해석하지 않는다. 사업별 통계의 기준일 안내는 사용자가 제공한 정확한 문구(62건: 2026.09.19 주제 분류 / 규정: 2026.09.13 승인본, 합산 금지)로 교체했다.

규정 화면의 데이터 영역은 **공개 데이터 기준일 2026-09-13 / 공개본 생성일 2026-09-14**를 정적 release에서 표시하고, **마지막 성공 수집일 / 다음 수집 예정일**만 서버 `/api/collection-state`가 기존 `api.public_collection_state()`에서 익명 publishable credential로 읽는다. 서버 전용 `KODIT_SUPABASE_*` URL/key 쌍을 우선하고 없으면 `NEXT_PUBLIC_SUPABASE_*` 쌍을 사용하며 쌍을 섞지 않는다. `GET`은 KODIT 프로젝트 호스트를 검사하고, 5초 타임아웃/상태 실패·키 미설정 시 `{available:false}`로 돌아가 정적 규정·CSV를 막지 않는다. 화면은 5분마다 상태만 갱신한다. **자동수집 주기 10일**은 별도 정적 라벨이며 GitHub Actions가 매일 due를 확인하는 것과 구분한다. 서버/Netlify 환경변수를 변경하거나 DB read contract·migration·승인 snapshot을 수정하지 않았다.

크론 코드 읽기 감사에서 자동 수집은 내부 관측/draft만 생성하고 공개 승인·정적 export는 수동인 분리 구조를 확인했다. 다만 `workers/collector/scheduled_collection.py`의 혼합 성공/실패가 `succeeded`로 완료되면 다음 10일 기준일을 앞당길 수 있고, claim 이후 워커 중단 시 `running` 잠금의 자동 만료가 없어 수집이 정지될 수 있다. 이는 공개본 자동 훼손 근거는 아니지만 운영 위험이므로 Codex 소관 [GitHub 이슈 #8](https://github.com/maenglion/KODIT-analysis/issues/8)로 분리했다. 실제 원격 크론 실행이나 DB 수정은 하지 않았다.

`pnpm check:regulations`, 공개 사이트 TS 검사·프로덕션 빌드, `git diff --check` 통과. Chromium 1440px/800px에서 1,041/205/831 요약·설정표 상단 펼침/ARIA·ALIO 필터 205행 CSV(BOM)·사규예고 2,089건 전환·상태 API 실패 격리·공개 RPC mock의 서울시간 표시·10일 주기·사업별 통계 정확 원고를 확인했다. 프리뷰에서 실제 상태 RPC 이용 가능 여부는 GitHub→Netlify 자동 deploy-preview가 나온 뒤 확인한다.

독립 읽기 전용 리뷰에서 (1) 서버 전용 환경변수 쌍 fallback, (2) 결과표 아래 버튼에서 **앞쪽**에 새로 나타난 설정표로 키보드 초점 진입 및 Escape 닫기, (3) 접힌 공개 범위 분류에 남는 `partial_*` 하위 선택의 표 머리 표시·즉시 해제가 필요하다고 확인했다. 서버 API 호스트 검증 및 키 쌍 우선순위를 추가했고, 설정표에 초점 진입·원래 버튼 복귀 및 모션 감소 대응을 구현했다. `partial_*`는 ALIO 출처 종류 필터가 아닌 별도 공개 속성으로 이름을 명시하고 표 머리에서 해제하게 했으며, 상세설정 적용 시 숨은 소분류를 초기화한다.

### PR #9 후속: 전 화면 공개본 날짜와 기술사양 집계 단위 (2026-10-03, 재검수 전)

사용자가 넓은 규정 전용 메타 띠 대신 모든 공개 페이지의 도입부 오른쪽에 작은 날짜 5항목을 같은 순서로 요청했다. 규정·사규예고·상세·잔차·부서/시맨틱/조직 히스토리·사업 통계 3화면·원고/방법론/기술사양 등 **13개 공개 뷰**에 공통 `CollectionStatus`를 배치했다. 고정 승인 release의 **공개 데이터 기준일 2026-09-13 / 생성일 2026-09-14**와, 별도 공개 상태 API에서 5분마다 읽는 마지막 성공 수집일·다음 예정일, **기본 간격 10일**을 구분한다. 기존 긴 ‘자동수집 상태’ 설명은 단일 정보 버튼의 native modal dialog로 옮겼다. Escape·닫기 버튼·초점 복귀를 지원하고 조회 실패 시에도 정적 목록을 보존한다.

조직도 정본 `organizationSnapshot.snapshotDate=2026-09-15`는 부서·잔차·시맨틱·조직 히스토리에 규정/예고 9/13과 별도 표시한다. 조직 히스토리는 시행문서 9/18도 함께 표시한다. 사업별 통계의 별도 검증본은 `topic-public-v2.json.measuredAt=2026-09-19`를 주 기준일로 삼으며 생성일 필드가 없어 **기록 없음**으로 표시한다. 조직 히스토리 역시 별도 생성일을 추정하지 않는다. 기술사양은 규정 9/13·생성 9/14와 parser 원장 9/17을 구분한다. 원고의 ‘설명 검토 10/03’은 생성일로 재사용하지 않는다. 첫 줄 다음에는 조직도/시행문서/parser처럼 **추가 근거 기준일**이 필요할 때만 작은 글씨로 더한다. 규정 요약은 작은 카드 4개 **1,041개 규정 버전 / ALIO 출처 연결 버전 205개 / NOTICE_ONLY 버전 831개 / 사규예고 게시물 2,089건**으로 바꾸고 카드 하단 중복 설명을 줄였다. 검색 버튼 글자를 22px에서 16px로 낮췄다.

기술사양의 보존 문서 2,414개×재현 2회=4,828회(9/13)와 별도 parser 원장 실행 기록 2,414건(9/17), 본문이 있는 실행 관측 2,403건, 원장 고유 추출 산출물 2,397건을 각각 다른 단위로 설명한다. HWP 298+28(17+11)=326, HWPX 353+5(4+1)=358의 식별 결과와 중첩 가능한 형식 불일치 지표는 서로 다른 그룹으로 표시한다. PDF의 본문 없음 1건은 OCR 미수행 경계를 존중해 ‘추출 가능한 텍스트 없음’으로 적었다. 사용자가 선호한 다이어그램 파일은 유지하되 caption에서 실행·추출 기록과 공개 승인이 별도임을 설명한다. 첨부 대화의 ‘승인 CSV만 서버 API로 제공’ 및 ‘2026-10-03 공개본 생성’은 현행 코드와 일치하지 않아 반영하지 않았다: Next server-only `review-data.ts`는 배포된 `public-snapshot-v1.json.gz`를 읽어 공개 UI에 전달하며 브라우저 CSV는 동일한 승인 데이터의 필터 결과로 생성한다. `/api/collection-state`는 규정 목록이 아닌 공개 수집 상태만 조회한다.

`pnpm check:regulations`·공개 사이트 TypeScript·프로덕션 빌드·`git diff --check` 통과. 로컬 프로덕션 Chromium **1440/800px × 13개 공개 뷰**에서 각각 5개 항목 순서·기준일·추가 날짜·생성일 미기재·10일 주기·상단 정렬/넘침 없음, 단일 모달 Escape 및 초점 복귀·4개 카드 숫자·기술사양 단위/다이어그램 보존을 확인했다. 기존 상세설정 브라우저 회귀의 ALIO 205건 CSV(BOM)·포함/제외·담당부서/기간 필터·부분공개 속성 표시 및 2,089건 예고 전환도 유지됐다. 이 변경은 UI·설명·회귀/워크로그에 한정하며 DB migration·public read contract·승인 snapshot·Netlify 설정은 수정하지 않는다.
