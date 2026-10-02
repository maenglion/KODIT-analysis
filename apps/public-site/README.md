# public-site

일반 공개 화면입니다. 배포 시점에 승인된 공개 release를 `data/public-snapshot-v1.json.gz`로 고정해 표시합니다. 브라우저 요청과 페이지 렌더링은 Supabase RPC의 가용성에 의존하지 않습니다. 기존 RPC·migration·검사 코드는 향후 외부 검증과 증빙을 위해 보존합니다.

브라우저 번들에는 DB 비밀번호·access token·service role key를 포함하지 않습니다. 규정 공개 snapshot은 개인·미매핑 표기를 공개 안전값으로 치환하고 내부 provenance 필드를 제거한 뒤 생성합니다.

```sh
pnpm install --frozen-lockfile
pnpm --filter @kodit/public-site dev
```

- 홈: `http://localhost:3000/`
- 규정 공개현황: `http://localhost:3000/regulations`
- 사업별 통계(정적 주제 검증본): `http://localhost:3000/investment-statistics`
- 조직·잔차 통계: `http://localhost:3000/department-statistics`
- 상단 1그룹: `/data-purpose`, `/methodology`, `/technical-specs`
- 규정 상세 예시: `http://localhost:3000/regulations/investment-option-guarantee`

사업별 통계 화면은 별도 2026-09-19 `topic-membership-v2` 검증 보고서를 공개 안전 필드로 축소한 `data/topic-public-v2.json`을 사용합니다. 규정 snapshot의 2026-09-13 기준일과 합치지 않습니다. 해당 정적 자료는 다음 명령으로 보고서에서 재현할 수 있습니다.

```sh
node tools/publish/build_topic_public_snapshot.mjs
```

기술 사양의 parser 수치는 보존 corpus 재현 로그와 추출 원장 요약의 공개 집계만 투영한 `data/public-parser-measurements.json`에서 표시합니다. 로그가 바뀌는 경우에만 아래 명령으로 재생성하고 계약 수치·기준일을 다시 검토합니다.

```sh
node tools/publish/build_public_parser_measurements.mjs
```

다이어그램의 정본은 `data/diagrams/*.mmd`이고 화면용 SVG는 `public/diagrams/*.svg`입니다. 잔차 ERD는 제공된 Mermaid 원문을 유지하고, 기술·방법론에는 독립적인 작은 그림을 배치했습니다. SVG를 다시 생성할 때는 Mermaid CLI `mmdc -c data/diagrams/mermaid-theme.json -i data/diagrams/residual-ledger-erd.mmd -o public/diagrams/residual-ledger-erd.svg`처럼 실행하되, 실행 환경에 Chromium/Puppeteer 경로를 지정해야 합니다. 확대 패널과 새 창 원본 보기를 지원합니다.

운영 공개는 기존 저장소와 Netlify 연결을 사용합니다. 이 작업은 별도 영구 웹사이트나 새로운 호스팅을 만들지 않으며, 원격 저장소 쓰기 권한이 확인되기 전에는 로컬 미리보기와 패치가 검수본입니다.

기존 `review-20260908`과 `review-20260913-reconstructed`는 provenance 재현 자료로 변경하지 않습니다. 규정·사규예고 다운로드 CSV는 화면과 동일한 공개 snapshot 배열에서 UTF-8 BOM으로 생성합니다. 새 승인 release를 공개할 때만 `node tools/publish/export_public_snapshot.mjs`로 규정 snapshot을 다시 생성하고 검증·커밋합니다. 이 export 작업은 기존 public credential을 런타임에만 사용하며 키를 파일에 복사하지 않습니다.

UI와 데이터 출처의 실행 경계 및 후속 RPC 연결 원칙은 [`docs/architecture/public-ui-runtime-contract.md`](../../docs/architecture/public-ui-runtime-contract.md)에 기록합니다.

향후 제한 공개 기능은 공용 비밀번호 하나가 아니라 사용자별 숫자 접근코드와 서버 세션을 사용해야 합니다. 그래야 이용자별 열람·다운로드 감사로그를 남길 수 있습니다. 이 접근 계층은 공개 snapshot 생성과 별도 계약으로 구현합니다.
