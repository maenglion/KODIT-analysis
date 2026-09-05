# workbench

수집·검증·판정·승격·사건 작업대입니다. 브라우저는 실제 Supabase Auth JWT로 `api`의 internal 표면만 사용합니다.

`case` 처리와 원본 쓰기는 서버 경계를 통과하며 service role을 브라우저에 전달하지 않습니다.
