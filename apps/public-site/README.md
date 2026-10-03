# public-site

일반 공개 화면입니다. 배포 시점에 승인된 공개 release를 `data/public-snapshot-v1.json.gz`로 고정해 표시합니다. **규정 목록·집계·CSV는 Supabase RPC 가용성에 의존하지 않습니다.** 예외적으로 상단 자동수집 상태만 서버 `/api/collection-state`가 기존 공개 `api.public_collection_state()`에서 읽으며, 조회 실패 시 상태만 `상태 조회 불가`로 표시하고 승인 규정 목록은 계속 제공합니다. 기존 RPC·migration·검사 코드는 외부 검증과 증빙을 위해 보존합니다.

브라우저 번들에는 DB 비밀번호·access token·service role key를 포함하지 않습니다. 공개 snapshot의 PERSON 계약은 별도 보안 패치가 완료되어야 하며, 현재 정적 공개본만으로 개인정보 비노출을 주장하거나 이 UI 브랜치를 운영에 병합해서는 안 됩니다.

```sh
pnpm install --frozen-lockfile
pnpm --filter @kodit/public-site dev
```

- 규정·법령 시작 화면: `http://localhost:3000/regulations` (기존 `/` 접근은 같은 화면으로 리디렉션하며 허용된 검색 쿼리를 유지). 작은 요약 카드는 **전체 사규예고 2,089건(게시물) → 승인 규정 1,041건(버전) → ALIO 출처 연결 규정 205건 → 사전예고만 831건** 순서입니다. ALIO 연결은 전문 공개의 동의어가 아닙니다. 결과표의 상세설정 버튼은 검색창과 표 사이의 2열 공개 필드 설정표를 열며, 포함/제외 단어 각 최대 3개, 공개 필드·공식 부서명 정확 일치·규정 출처 종류·기간을 조건으로 삼습니다. **첨부파일명은 규정 단독, 연결된 규정명은 사규예고 단독** 범위에서만 선택 가능하고 미지원 시 비활성 사유가 옆에 표시됩니다. 공개결론 네 값은 규정 버전에만 복수 선택으로 적용합니다. 조직도 2026-09-15 정본은 공식 부서 **20개**(요청의 24개가 아님)이며, 부서 옆 건수는 선택한 자료·공개결론에 따른 승인본의 **담당 표기 정확 일치 행 수**입니다. 0건 부서도 목록에 남기고, 전체 선택은 공식 20개로 좁히며 선택 해제는 부서 제한을 제거합니다. 검색어·기간 조건은 이 부서 옆 건수에 반영하지 않습니다. `필터 결과 전체 CSV`는 현재 페이지가 아니라 같은 조건의 필터된 모든 규정/예고 행을 내려받습니다. 기존 `부분 공개` 하위 분류(`partial_*` 공개 속성)는 **출처 종류 ALIO 필터와 다르며**, 분류 영역을 접어도 표 제목 옆의 활성 조건 칩에서 확인·해제할 수 있습니다. 본문 검색·**공식 근거 없는 과거→현재 조직 자동 매칭은 제공하지 않습니다.**
- 사업별 통계(정적 주제 검증본): `/investment-statistics` 요약, `/investment-statistics/yearly-notices` 연도별 사규예고, `/investment-statistics/evidence-notices` 근거 사규예고. 요약 카드·연도를 누르면 선택한 하위군 또는 연도를 URL 매개변수로 근거 목록에 전달합니다. 목록에서 하위군을 바꾸거나 해제하면 주소도 갱신되어 새로고침·공유 후에도 동일한 선택 상태를 유지하며, CSV는 현재 필터 결과만 내보냅니다.
- 부서별 통계: `/department-statistics` 요약, `/department-statistics/semantic-matching` 시맨틱 매칭방식, `/department-statistics/organization-history` 조직 히스토리. 각 화면은 상단 메뉴로 이동하며 한 화면의 긴 앵커가 아닙니다.
- 담당 표기 잔차 데이터: `http://localhost:3000/residual-data`. 공개 표기 355개를 관측 분류 복수 선택·표시명/관련 사규예고 수 정렬·10개 단위 페이지로 살펴보고 클릭한 행 바로 아래에서 상세를 펼칩니다. 두 CSV는 현재 페이지 10행이 아니라 **선택한 분류 전체 표기 및 연결 관측 전체**를 내보냅니다. PERSON은 승인 한글 초성+4자리 공개 별칭과 관측 게시물·일자·공식 목록 URL·관측 횟수만 렌더링하며 조직 후보·업무귀속·이동 경로·추론 과정을 표시하지 않습니다. 서버는 별도 PERSON 관측 DTO만 전달하며 원장 식별자·조직 관련 **키 자체를 포함하지 않고**, 유형·별칭·공식 URL 불일치 시 실패합니다. PERSON이 포함된 CSV는 원장 ID·조직 헤더를 생략하며 조직 판정 루브릭은 비PERSON에만 노출합니다. 이 UI 방어는 기존 공개 RPC·checked-in snapshot의 문제를 해결하지 못하므로 Codex의 분리 공개계약·snapshot 재생성 전에는 운영에 반영하지 않습니다. 본문 근거 링크는 개별 문서 원문이 아니라 신보의 공식 `사규 제개정 예고` **목록 페이지**이며, 같은 제목은 순번으로 구별합니다.
- 상단 1그룹: `/data-purpose`, `/methodology`, `/technical-specs`
- 규정 상세 예시: `http://localhost:3000/regulations/investment-option-guarantee`

모든 공개 화면은 도입부 오른쪽에 **공개 데이터 기준일 → 공개본 생성일 → 마지막 성공 수집일 → 다음 수집 예정일 → 자동수집 주기**를 같은 작은 형식으로 표시합니다. 규정/예고 공개본은 2026-09-13 기준·2026-09-14 생성, 조직도는 별도 2026-09-15, 주제 분류본은 2026-09-19 기준입니다. 주제 분류본·조직 히스토리는 생성일 필드가 없어 **기록 없음**으로 표시하며 규정 공개본 생성일이나 설명 검토일을 대신 붙이지 않습니다. 필요하면 조직/시행문서·parser 원장처럼 두 번째 기준일을 첫 항목 아래에 표시합니다. 동적 수집 상태의 긴 의미는 단일 정보 아이콘의 키보드 접근 가능한 대화상자에 둡니다. 성공 기록은 모든 출처의 완료 또는 공개 승인을 뜻하지 않습니다.

`/data-purpose`의 본문 정본은 `content/data-purpose.md`입니다. 2026-10-03에 전달받은 원고를 기준본으로 두고 이전 화면의 도식·4개 카드·하단 홍보 블록은 제거했습니다. 오른쪽 **변경이력(0)**은 이 *안내문 자체*에 기준본 이후 기록된 수정 건수이며, 크론 수집 결과나 규정 버전별 변경행의 0건을 뜻하지 않습니다. 이 화면의 문구를 바꿀 때는 다음 명령으로 날짜·변경 설명·본문 해시를 기록해야 합니다. 기록하지 않으면 공개 사이트의 빌드가 실패합니다.

```sh
node tools/check-data-purpose-content.mjs --record "수정 내용 요약"
pnpm check:purpose
```

사업별 통계 화면은 별도 2026-09-19 `topic-membership-v2` 검증 보고서를 공개 안전 필드로 축소한 `data/topic-public-v2.json`을 사용합니다. 규정 snapshot의 2026-09-13 기준일과 합치지 않습니다. 해당 정적 자료는 다음 명령으로 보고서에서 재현할 수 있습니다.

```sh
node tools/publish/build_topic_public_snapshot.mjs
```

기술 사양의 parser 수치는 보존 corpus 재현 로그와 추출 원장 요약의 공개 집계만 투영한 `data/public-parser-measurements.json`에서 표시합니다. 로그가 바뀌는 경우에만 아래 명령으로 재생성하고 계약 수치·기준일을 다시 검토합니다.

```sh
node tools/publish/build_public_parser_measurements.mjs
node tools/publish/build_public_parser_measurements.mjs --check
```

기술 사양에는 HWP/HWPX의 **본문 추출·규정 식별 결과**와 중첩 가능한 **별도 형식 판별 지표**를 분리해 표시합니다. 2026-09-13 보존 문서 2,414개의 2회 재현 시도 4,828회, 별도 2026-09-17 원장 parser 실행 기록 2,414건, 본문이 있는 실행 관측 2,403건과 고유 추출 산출물 2,397건은 각각 다른 단위입니다. PDF의 `NO_EXTRACTABLE_TEXT` 1건은 ‘추출 가능한 텍스트 없음’이지 원문 부재 확정이 아닙니다. 검토 근거는 [`docs/architecture/parser-operation-review-20261003.md`](../../docs/architecture/parser-operation-review-20261003.md)에 기록했습니다. 개별 문서 로그·실행 ID·파일 해시는 공개 번들에 포함하지 않습니다.

조직 변경 화면의 확인된 이벤트·공식 연도별 자료는 기존 승인 공개본과 계약의 공개 가능 필드만 `data/organization-public-history-v1.json`으로 투영합니다. 다음 명령으로 2024·2026년의 **개인정보보호 기능 이관** 2건, 사규예고 52건, 관련 공개·시행 문서 및 확정 신설조직 0건이 정본과 일치하는지 확인합니다. 법적 신설일·근거 조항을 추정하지 않습니다.

```sh
node tools/publish/build_public_organization_history.mjs
node tools/publish/build_public_organization_history.mjs --check
```

시각 체계는 `app/styles.css`의 공통 토큰·헤더와 `app/styles/{regulations,department,residual,topic,information,detail}.css`의 화면별 규칙으로 나눕니다. `/regulations`에서는 요약 뒤 검색창과 결과표가 이어지고, 표 아래쪽 도구 버튼에서 위의 상세설정 표를 펼칩니다. 검색어는 **검색 버튼/Enter 제출 후**, 상세 조건은 **적용**을 눌러 반영합니다. 빠른 기간의 기준일은 오늘이 아닌 **승인 공개본 기준일**이며 1개월·6개월·1년 버튼 바로 앞에 명시합니다. 상단 정보 링크는 각각의 페이지로 바로 이동합니다. 본문은 [한국출판인회의 KoPubWorld 돋움](https://www.kopus.org/biz-electronic-font2/) 공식 2026 TTF 묶음의 Medium(400), Bold(700)를 웹폰트 임베딩 승인에 따라 **바이트 변경 없이** `public/fonts/`에 사용합니다. 일부 제목에만 기존 Paperlogy를 씁니다. KoPub의 글리프를 수정하거나 서브셋·포맷 변환하지 않았습니다. 최대 본문 폭은 1296px, 최소 웹 화면 폭은 768px입니다. 모바일에서는 768px 태블릿 레이아웃을 가로로 볼 수 있고 세션당 한 번 PC·태블릿 최적화 안내 모달이 열립니다.

다이어그램의 정본은 `data/diagrams/*.mmd`이고 화면용 SVG는 `public/diagrams/*.svg`입니다. 잔차 ERD는 제공된 Mermaid 원문을 유지하고, **기술·방법론 페이지에만** 독립적인 작은 그림을 배치했습니다. `/data-purpose`의 전용 흐름도 원본·SVG는 사용자가 제거를 요청해 삭제했습니다. 잔차 화면의 발생·처리 설명은 `/methodology#residual-ledger-erd`로 직접 연결됩니다. 2026-10-03의 재렌더링에서 기본 Mermaid 글자를 한 단계(작은 흐름도 14px, 전체 ERD 13px) 낮췄습니다. SVG를 다시 생성할 때는 Mermaid CLI `mmdc -c data/diagrams/mermaid-theme.json -i data/diagrams/residual-ledger-erd.mmd -o public/diagrams/residual-ledger-erd.svg`처럼 실행하되, 실행 환경에 Chromium/Puppeteer 경로를 지정해야 합니다. 확대 패널과 새 창 원본 보기를 지원합니다.

운영 공개는 기존 GitHub 저장소 `maenglion/KODIT-analysis`의 `main`과 연결된 `https://letscheck-sinbo.netlify.app`을 사용합니다. 별도 영구 웹사이트나 새로운 호스팅은 만들지 않았습니다. 2026-10-03 승인된 PR #3의 원고 변경은 `main`에 병합됐고 기존 자동 배포로 운영 `/data-purpose`에서 확인했습니다. Netlify 설정은 직접 변경하지 않았습니다.

기존 `review-20260908`과 `review-20260913-reconstructed`는 provenance 재현 자료로 변경하지 않습니다. 규정·사규예고 다운로드 CSV는 화면과 동일한 공개 snapshot 배열과 **같은 적용 조건**에서 UTF-8 BOM으로 생성합니다. 새 승인 release를 공개할 때만 `node tools/publish/export_public_snapshot.mjs`로 규정 snapshot을 다시 생성하고 검증·커밋합니다. 이 export 작업은 기존 public credential을 런타임에만 사용하며 키를 파일에 복사하지 않습니다. 자동수집은 매일 실행 여부를 확인하고 기본 수집 간격 10일로 실행되며, 변경이 있을 때만 내부 draft를 만듭니다. 성공 수집일이나 다음 예정일이 변경돼도 승인 공개본 기준일·내용은 자동으로 갱신되지 않습니다. 수집 상태 API는 서버 전용 `KODIT_SUPABASE_URL`/`KODIT_SUPABASE_PUBLISHABLE_KEY` 쌍을 우선하고 없으면 `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 쌍을 사용합니다. 서로 다른 쌍의 URL/키를 섞지 않고 KODIT 프로젝트 호스트만 허용하며, 키 누락·오류이면 상태만 확인 불가로 표시합니다. Netlify 설정/API는 이 코드에서 변경하지 않습니다.

UI와 데이터 출처의 실행 경계 및 후속 RPC 연결 원칙은 [`docs/architecture/public-ui-runtime-contract.md`](../../docs/architecture/public-ui-runtime-contract.md)에 기록합니다.

향후 제한 공개 기능은 공용 비밀번호 하나가 아니라 사용자별 숫자 접근코드와 서버 세션을 사용해야 합니다. 그래야 이용자별 열람·다운로드 감사로그를 남길 수 있습니다. 이 접근 계층은 공개 snapshot 생성과 별도 계약으로 구현합니다.
