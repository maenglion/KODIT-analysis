# public-site

일반 공개 화면입니다. v0.5 reconstructed provenance를 갖춘 최신 승인본을 우선 읽고, 해당 승인본이 없으면 서버에 번들된 1,041건 재구성 검토본으로 전환합니다. v0.4 승인본은 현재 판정으로 다시 노출하지 않습니다.

브라우저 번들에는 DB 비밀번호·access token·service role key를 포함하지 않습니다. 자동수집 자격증명이 없으면 검토본은 그대로 표시하고 실행상태를 `실행대기`로 표시합니다.

```powershell
pnpm --filter @kodit/public-site dev
```

상세 페이지: `http://localhost:3000/regulations/investment-option-guarantee`

전체 검토본: `http://localhost:3000/regulations`

전체 화면의 fallback은 `data/review-20260913-reconstructed`의 CSV와 manifest를 서버에서 읽습니다. 기존 `review-20260908`은 변경하지 않은 legacy snapshot입니다. 브라우저에는 로컬 경로나 자격증명을 전달하지 않으며, 다운로드 CSV는 화면과 같은 배열에서 UTF-8 BOM으로 생성합니다.

공개 조회에는 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`만 사용합니다. 공개 RPC는 최신 승인본과 안전한 실행상태 필드만 반환하며, 새 자동수집 draft가 생겨도 승인 전에는 화면 데이터를 교체하지 않습니다.
