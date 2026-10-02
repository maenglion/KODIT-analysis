# 공개 UI와 정적 실행 경계

## Status

- 2026-10-02 UI 구현 기준. 기준 commit: `b5bbd33`.
- 공개 사이트의 주 실행 경로는 승인된 정적 snapshot이다. 조직·잔차 관련 의미 계약은 변경하지 않는다.

## Purpose

피그마 `letscheck-SINBO`의 1차 정보 메뉴, 규정 목록 및 통계 화면을 완성하면서 공개 사이트의 가용성을 데이터 API 장애와 분리한다. 공개된 수치가 서로 다른 승인 시점·계약에서 왔을 때 동일한 실시간 집계처럼 보이지 않게 한다.

## Canonical sources

- 규정 목록·사규예고·부서 및 잔차 화면: `apps/public-site/data/public-snapshot-v1.json.gz` (`evidence_as_of=2026-09-13`, 생성일 2026-09-14). 기존 승인본을 재집계하거나 교체하지 않는다.
- 투자·보증 주제 화면: `reports/measurements/2026-09-19-topic-membership-v2/{summary,member-review}.json`에서 공개 필드만 복사한 별도 정적 파일. `topic-membership-v2`의 투자·자본성 금융 관련 승인 9개 family와 `DISTINCT notice_id` 기준 62건이다. 2026-09-19 주제 측정치를 2026-09-13 규정 snapshot의 하위 집계로 표시하지 않는다.
- 주제 분류 의미·중복 규칙: `docs/architecture/topic-analysis-contract.md`, `config/topic-membership-v2.json`.
- UI 화면 참조: [피그마 `페이지 기획`의 `letscheck-SINBO` 프레임](https://www.figma.com/design/8y8T16UoFNxl47kuT8C2dO/%ED%8E%98%EC%9D%B4%EC%A7%80-%EA%B8%B0%ED%9A%8D?node-id=8-11). 미완성 시안은 자료의 의미 계약과 접근성을 해치지 않는 범위에서 보완한다.

## Decisions and invariants

1. 현재 공개 사이트의 초기 렌더링·검색·통계·CSV는 Supabase RPC 호출을 요구하지 않는다. 향후 외부 검증과 증빙을 위한 기존 RPC, migration, 검사 스크립트 및 계약은 **삭제하거나 대체하지 않는다**. 연결 재개는 별도 승인·검증 단계에서 수행한다.
2. 주제별 숫자는 `topic-membership-v2`의 기록된 측정값으로 표시한다. 소송과 투자·보증의 대분류, 9개 하위군, 사규예고 중복 집계, '선정 업무 키워드'와 직접 해소된 조직 수를 혼동하지 않는다. `보증 OR 투자` 문자열만으로 주제 회원을 새로 만들지 않는다.
3. 주제 화면의 각 공식 게시물 링크는 유효한 공개 URL에 한정한다. 2026-09-19 주제 통계와 2026-09-13 규정 검색을 상호 연결할 때 별도 기준일을 안내한다.
4. 상단 1차 정보 메뉴의 목적·방법론·기술 설명은 확인된 설계와 공개 자료 범위 안에서 작성한다. 법적 확정, 개인 평가, 수치의 실시간성, 이름이 확인되지 않은 담당 조직을 주장하지 않는다.
5. 홈과 내비게이션, 버튼, 검색, 다운로드, 상세 설정은 같은 파란색 계열의 토큰·초점·호버 상태를 사용한다. 모바일에서 전체 사이트를 숨기지 않으며 표와 잔차의 상세 근거는 필요하면 가로 스크롤로 보존한다. Inter 중심의 제한된 타입 스케일을 사용한다.

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

## Verification (2026-10-02)

- `pnpm --filter @kodit/public-site check`, `pnpm --filter @kodit/public-site build`, `pnpm check`, `pnpm check:regulations`, `pnpm check:technical-specs`, `pnpm check:approved`, `pnpm check:residual-analysis`, `pnpm check:t07c`, `pnpm test`: 통과.
- 390px 브라우저에서 5개 공개 경로가 모두 HTTP 200, 앱 표시 및 전체 문서 가로 넘침 없음. 주제 하위군 33건 필터와 제목 검색 5건, 규정 용어 펼침, 통합검색 규정·사규예고 51번 항목 이동 확인.
- 서비스별 독립적인 시점과 원문 식별 정보는 아직 통합 승격하지 않았다. 이력 검토 후 필요한 경우 별도 공개본으로 다룬다.

## Information-page evidence (2026-10-02)

- `reports/measurements/2026-09-13-runtime-v1-reproduction/{hwp,hwpx}/batch-run.json`: HWP 326건(추출·신원 확인 298, 신원 미해결 28), HWPX 358건(353, 5). 각 입력 두 번 재현했고 parser 실패 0건, 추출 해시 이상 0건이다. 신원 미해결은 parser 실패가 아니다.
- `reports/measurements/2026-09-13-pdf-full-corpus/batch-run.json`: strict PDF 1,730건 중 SUCCESS 1,719, NO_EXTRACTABLE_TEXT 1, DOCUMENT/PDF_READ_FAILED 10. 개별 PDF의 기술 결과는 규정 버전의 공개 availability를 변경하지 않는다.
- `reports/measurements/2026-09-17-document-extraction-backfill/summary.json`: 2,414 parser run, 2,408 고유 바이너리, 2,397 고유 추출 artifact. 화면 자료는 `tools/publish/build_public_parser_measurements.mjs`에서 검증·공개 필드 투영 후 생성하며 내부 원장의 행별 값은 브라우저에 싣지 않는다.
- 축약 흐름도 4개와 제공 ERD 1개는 `apps/public-site/data/diagrams/*.mmd`가 재현 가능한 원본이고 `apps/public-site/public/diagrams/*.svg`가 공개 화면 자산이다. 큰 ERD는 기본 화면에 축소 미리보기로만 놓고 확대·원본 크기·SVG 새 창 보기를 제공한다. 텍스트 설명이 도식의 유일한 대체 수단이 되지 않도록 각 영역에 설명을 함께 둔다.
- GitHub `maenglion/KODIT-analysis` 쓰기 권한은 현재 연결 계정에서 403이다. 로컬 브랜치/패치 상태로 보존하며 원격 배포 여부를 주장하지 않는다.
