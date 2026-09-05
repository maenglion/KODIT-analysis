# 물리 스키마와 접근 경계

| 스키마 | 책임 | 브라우저 접근 |
|---|---|---|
| `public` | 플랫폼 기본 스키마. 업무 객체를 두지 않음 | 노출 전환 후 PostgREST 제외 |
| `core` | 규정, 문서, URL 관찰, 주장, 판정, 통계, 기사, 배포 원장 | 금지 |
| `case` | 사건, 당사자, 보증번호, 사건 문서, 사건성 정보공개청구 | 금지·PostgREST 미노출 |
| `api` | 역할별 allowlist view와 최소권한 RPC | 허용 |

참조는 `case → core`만 허용합니다. `core → case`와 `api → case`는 정적 검사와 DB 테스트로 금지합니다.

`security_invoker` 뷰가 원본 권한 없이 직접 `core`를 읽을 수 없는 PostgreSQL 특성 때문에, API 뷰는 필터링된 `SECURITY DEFINER` 함수를 호출합니다. 각 함수는 빈 `search_path`와 완전한 스키마명을 사용하며 EXECUTE 권한을 명시적으로 제한합니다. 사건 데이터용 API 함수는 만들지 않습니다.

## 애플리케이션 경계

| 앱 | 책임 | 데이터 경로 |
|---|---|---|
| `public-site` | 일반 공개 조회 | anon → `api.public_*` |
| `office-portal` | 의원실 승인 조회·배포파일 다운로드 | Auth JWT + `office` 프로필 → office API·`release-artifacts` |
| `workbench` | 수집·검증·승격 | Auth JWT + `internal` 프로필 → internal API |
| workbench 서버 | 사건 작업과 수집기 쓰기 | 서버 보관 자격증명 → `core`/`case`; 브라우저 전달 금지 |

`office`와 `internal`은 PostgreSQL login role이 아니라 `auth.users`와 연결된 `core.user_access_profiles` 값입니다.
