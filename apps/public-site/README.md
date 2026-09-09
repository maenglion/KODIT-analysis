# public-site

일반 공개 화면입니다. 원본 1,041건 검토본은 서버에 번들된 CSV에서 읽고, 자동수집 실행상태만 서버 전용 Supabase RPC로 읽습니다.

브라우저 번들에는 DB 비밀번호·access token·service role key를 포함하지 않습니다. 자동수집 자격증명이 없으면 검토본은 그대로 표시하고 실행상태를 `실행대기`로 표시합니다.

```powershell
pnpm --filter @kodit/public-site dev
```

상세 페이지: `http://localhost:3000/regulations/investment-option-guarantee`

전체 검토본: `http://localhost:3000/regulations`

전체 화면은 `data/review-20260908`의 CSV와 manifest를 서버에서 읽습니다. 브라우저에는 로컬 경로나 자격증명을 전달하지 않으며, 다운로드 CSV는 공통 열 계약으로 UTF-8 BOM을 붙여 생성합니다.

실행상태 연결에는 `KODIT_SUPABASE_URL`과 `KODIT_SUPABASE_SERVICE_ROLE_KEY`를 서버 환경변수로만 사용합니다. 새 자동수집 draft가 생겨도 승인 전에는 번들된 검토본을 자동 교체하지 않습니다.
