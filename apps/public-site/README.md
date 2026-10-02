# public-site

일반 공개 화면입니다. 배포 시점에 승인된 공개 release를 `data/public-snapshot-v1.json.gz`로 고정해 표시합니다. 브라우저 요청과 페이지 렌더링은 Supabase RPC의 가용성에 의존하지 않습니다. 기존 RPC·migration·검사 코드는 향후 외부 검증과 증빙을 위해 보존합니다.

브라우저 번들에는 DB 비밀번호·access token·service role key를 포함하지 않습니다. 규정 공개 snapshot은 개인·미매핑 표기를 공개 안전값으로 치환하고 내부 provenance 필드를 제거한 뒤 생성합니다.

```sh
pnpm install --frozen-lockfile
pnpm --filter @kodit/public-site dev
```

- 규정·법령 시작 화면: `http://localhost:3000/regulations` (기존 `/` 접근은 같은 화면으로 리디렉션하며 허용된 검색 쿼리를 유지)
- 사업별 통계(정적 주제 검증본): `http://localhost:3000/investment-statistics`
- 부서별 통계·조직 히스토리: `http://localhost:3000/department-statistics`
- 담당 표기 잔차 데이터: `http://localhost:3000/residual-data`
- 상단 1그룹: `/data-purpose`, `/methodology`, `/technical-specs`
- 규정 상세 예시: `http://localhost:3000/regulations/investment-option-guarantee`

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

기술 사양에는 HWP/HWPX의 처리 단계·신원 미해결 이유·확장자/실제 형식 불일치, PDF 읽기 실패·OCR 미수행, 2026-09-13 재현 시도와 2026-09-17 원장 적재의 구분을 표시합니다. 검토 근거는 [`docs/architecture/parser-operation-review-20261003.md`](../../docs/architecture/parser-operation-review-20261003.md)에 기록했습니다. 개별 문서 로그·실행 ID·파일 해시는 공개 번들에 포함하지 않습니다.

조직 변경 화면의 확인된 이벤트·공식 연도별 자료는 기존 승인 공개본과 계약의 공개 가능 필드만 `data/organization-public-history-v1.json`으로 투영합니다. 다음 명령으로 2024·2026년의 **개인정보보호 기능 이관** 2건, 사규예고 52건, 관련 공개·시행 문서 및 확정 신설조직 0건이 정본과 일치하는지 확인합니다. 법적 신설일·근거 조항을 추정하지 않습니다.

```sh
node tools/publish/build_public_organization_history.mjs
node tools/publish/build_public_organization_history.mjs --check
```

시각 체계는 `app/styles.css`의 공통 토큰·헤더와 `app/styles/{regulations,department,residual,topic,information,detail}.css`의 화면별 규칙으로 나눕니다. 제공된 시안처럼 `/regulations`에서 검색창과 표로 바로 이어지고, 검색어는 **검색 버튼/Enter 제출 후** 적용합니다. 상단 정보 링크는 각각의 페이지로 바로 이동합니다. 본문은 [한국출판인회의 KoPubWorld 돋움](https://www.kopus.org/biz-electronic-font2/) 공식 2026 TTF 묶음의 Medium(400), Bold(700)를 웹폰트 임베딩 승인에 따라 **바이트 변경 없이** `public/fonts/`에 사용합니다. 일부 제목에만 기존 Paperlogy를 씁니다. KoPub의 글리프를 수정하거나 서브셋·포맷 변환하지 않았습니다. 최대 본문 폭은 1296px, 최소 웹 화면 폭은 768px입니다. 모바일에서는 768px 태블릿 레이아웃을 가로로 볼 수 있고 세션당 한 번 PC·태블릿 최적화 안내 모달이 열립니다.

다이어그램의 정본은 `data/diagrams/*.mmd`이고 화면용 SVG는 `public/diagrams/*.svg`입니다. 잔차 ERD는 제공된 Mermaid 원문을 유지하고, **기술·방법론 페이지에만** 독립적인 작은 그림을 배치했습니다. `/data-purpose`의 전용 흐름도 원본·SVG는 사용자가 제거를 요청해 삭제했습니다. 2026-10-03의 재렌더링에서 기본 Mermaid 글자를 한 단계(작은 흐름도 14px, 전체 ERD 13px) 낮췄습니다. SVG를 다시 생성할 때는 Mermaid CLI `mmdc -c data/diagrams/mermaid-theme.json -i data/diagrams/residual-ledger-erd.mmd -o public/diagrams/residual-ledger-erd.svg`처럼 실행하되, 실행 환경에 Chromium/Puppeteer 경로를 지정해야 합니다. 확대 패널과 새 창 원본 보기를 지원합니다.

운영 공개는 기존 GitHub 저장소 `maenglion/KODIT-analysis`의 `main`과 연결된 `https://letscheck-sinbo.netlify.app`을 사용합니다. 별도 영구 웹사이트나 새로운 호스팅은 만들지 않았습니다. 2026-10-03 PR #1 병합 후 이 주소에서 새 방법론·기술 사양·잔차 ERD 자산을 확인했으며 Netlify 설정은 직접 변경하지 않았습니다.

기존 `review-20260908`과 `review-20260913-reconstructed`는 provenance 재현 자료로 변경하지 않습니다. 규정·사규예고 다운로드 CSV는 화면과 동일한 공개 snapshot 배열에서 UTF-8 BOM으로 생성합니다. 새 승인 release를 공개할 때만 `node tools/publish/export_public_snapshot.mjs`로 규정 snapshot을 다시 생성하고 검증·커밋합니다. 이 export 작업은 기존 public credential을 런타임에만 사용하며 키를 파일에 복사하지 않습니다.

UI와 데이터 출처의 실행 경계 및 후속 RPC 연결 원칙은 [`docs/architecture/public-ui-runtime-contract.md`](../../docs/architecture/public-ui-runtime-contract.md)에 기록합니다.

향후 제한 공개 기능은 공용 비밀번호 하나가 아니라 사용자별 숫자 접근코드와 서버 세션을 사용해야 합니다. 그래야 이용자별 열람·다운로드 감사로그를 남길 수 있습니다. 이 접근 계층은 공개 snapshot 생성과 별도 계약으로 구현합니다.
