# Database access tests

원격 적용 전 로컬 Supabase에서 실행할 접근계약 테스트입니다.

- anon: 일반 공개 allowlist만
- office: 의원실 승인 API
- internal: 작업대 API
- case: 브라우저 직접 접근과 Data API 노출 금지

`0001`과 `0002`는 카탈로그·제약조건 단위 테스트입니다. 실제 접근계약은
`remote_access_contract.mjs`가 검증합니다.

원격 접근계약 fixture는 운영 migration과 분리되어 있습니다.

1. 직접 PostgreSQL 테스트 연결로 `fixtures/0001_access_contract_fixtures.sql`을 적용합니다.
2. 네 개의 환경변수를 프로세스에만 주입하고 `pnpm test:remote-access`를 실행합니다.
3. 직접 PostgreSQL 연결로 `fixtures/9999_drop_test_support.sql`을 실행합니다.

`test_support`는 `supabase/config.toml`의 PostgREST 노출 스키마에 포함하지 않습니다.
fixture 함수에는 `PUBLIC`, `anon`, `authenticated`, `service_role` 실행 권한이 없으며
테스트 DB 연결에서만 호출합니다.

- service role: 임시 Auth 사용자와 Storage fixture 생성·정리에만 사용
- 직접 PostgreSQL 연결: 권한 프로필과 행 fixture 생성·정리에만 사용
- 일반 공개: publishable key가 부여하는 anon 역할로 검사
- 의원실·내부: 임시 Supabase Auth 사용자가 로그인해 받은 실제 JWT로 검사
- `core`·`case`: 세 역할 모두 Data API에서 406이어야 함

키와 DB 연결 문자열은 파일에 저장하지 말고 `.env.example`에 적힌 환경변수로만 주입합니다.
