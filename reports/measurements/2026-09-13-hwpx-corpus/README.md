# HWPX corpus 측정 및 실물 root check

- corpus: `preannouncement_rule_match_20260831/downloads`
- 전체 보존파일: 2,464개
- 외부 HTTP: 사용하지 않음
- DB 및 상태 변경: 없음
- 측정 JSON SHA-256: `25a83095cf13f93afbf3a11457a078136637534ce8f0e794955a5432f9730411`

## Magic 및 구조 측정

| 분류 | 건수 |
|---|---:|
| `PDF` | 1,730 |
| `ZIP_HWPX` | 358 |
| `OLE_HWP` | 326 |
| `OTHER` | 50 |
| `ZIP_HWPX_CANDIDATE` | 0 |

`ZIP_HWPX`는 ZIP magic만으로 판정하지 않았다. `application/hwp+zip` mimetype,
`Contents/content.hpf`, `Contents/header.xml`, 하나 이상의 숫자형
`Contents/sectionN.xml`을 모두 확인했다.

실제 HWPX 358건 중 KODIT 첨부는 354건, ALIO 첨부는 4건이다. ALIO 1건은 파일
확장자가 `.hwp`이지만 실제 magic과 내부구조는 HWPX였다. 따라서 production 연결 시
확장자가 아니라 magic dispatcher를 사용해야 한다.

## 실물 root check 5건

KODIT 3건과 ALIO 2건을 출처·크기·section 수가 다르게 선정했다.

| 표본 | 크기 | section | SHA | 본문 | 규정명 |
|---|---:|---:|---|---|---|
| 임금피크제 운영기준 사전예고 | 32,943 | 1 | 일치 | 추출 성공 | 식별 성공 |
| 투자업무처리기준 사전예고 | 44,441 | 1 | 일치 | 추출 성공 | 식별 성공 |
| 매출채권보험 인수업무기준 외 8개 사전예고 | 67,131 | 1 | 일치 | 추출 성공 | 식별 성공 |
| 해상풍력대출보증약관 면책기준 | 75,044 | 1 | 일치 | 추출 성공 | 식별 성공 |
| 혁신스타트업 성장지원 프로그램 운용기준 | 929,424 | 4 | 일치 | 추출 성공 | 식별 성공 |

5건 모두 엄격한 `ZIP_HWPX` 구조, baseline SHA, 비어 있지 않은 본문과 대상 규정명을
확인했다. 이 root check는 canary PASS를 대신하지 않는다. parser 코드를 커밋한 뒤 같은
5건을 별도 `HWPX_CANARY`에서 각각 두 번 실행해 extract hash 재현성을 검증한다.
