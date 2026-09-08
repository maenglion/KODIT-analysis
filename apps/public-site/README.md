# public-site

일반 공개 화면입니다. 현재 원격 PostgREST에 `api`가 노출되지 않았으므로 서버 전용 모듈이 PostgreSQL 또는 Supabase Management API로 읽습니다.

브라우저 번들에는 DB 비밀번호·access token·service role key를 포함하지 않습니다. 환경변수가 없거나 연결이 실패하면 샘플 데이터를 대신 표시하지 않고 연결 필요 상태를 보여줍니다.

```powershell
pnpm --filter @kodit/public-site dev
```

상세 페이지: `http://localhost:3000/regulations/investment-option-guarantee`

전체 검토본: `http://localhost:3000/regulations`

전체 화면은 `data/review-20260908`의 CSV와 manifest를 서버에서 읽습니다. 브라우저에는 로컬 경로나 자격증명을 전달하지 않으며, 다운로드 CSV는 공통 열 계약으로 UTF-8 BOM을 붙여 생성합니다.

서버 연결은 `KODIT_DATABASE_URL`을 우선 사용합니다. 로컬 검증에서는 `KODIT_SUPABASE_PROJECT_REF`와 `KODIT_SUPABASE_ACCESS_TOKEN` 조합도 사용할 수 있습니다. 두 값은 반드시 프로세스 환경변수로만 전달합니다.
