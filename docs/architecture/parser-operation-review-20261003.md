# Parser 동작·실행 로그 검토 — 2026-10-03

## 검토 범위

KODIT 기술 사양 화면의 HWP·HWPX·PDF 설명을 실제 runner, 공유 runtime 계약, 2026-09-13 보존 corpus 실행 기록, 2026-09-17 추출 원장 집계와 대조했다. **2026-09-13 재현 실행**과 **2026-09-17 원장 적재**는 별개 단계이므로 합산하지 않는다. 문서별 파일명, 내부 경로, 원문, 해시, 실행 ID, 오류 전문은 공개 페이지에 싣지 않는다. 공개용 수치는 `tools/publish/build_public_parser_measurements.mjs`의 검증을 거쳐 `apps/public-site/data/public-parser-measurements.json`에만 투영한다.

| 형식 | 보존 문서 | 재현 시도(각 2회) | 추출·신원 확인 또는 본문 추출 | 추출 후 신원 미해결 | 본문 없음 | 문서 읽기 실패 | 해시 재현 이상 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| OLE HWP | 326 | 652 | 298 | 28 | 0 | 0 | 0 |
| ZIP HWPX | 358 | 716 | 353 | 5 | 0 | 0 | 0 |
| PDF | 1,730 | 3,460 | 1,719 | 해당 없음(미평가) | 1 | 10 | 0 |

HWP/HWPX의 미해결 **33건은 모두 파싱·본문 추출에 성공**했다. 보존된 첨부 기준명 자체가 없는 건은 HWP 17건·HWPX 4건(총 21건), 기준명은 있지만 본문 표기가 맞지 않는 건은 HWP 11건·HWPX 1건(총 12건)이다. 이름을 파일명에서 추정하지 않는다. 확장자와 실제 구조가 다른 사례는 OLE HWP가 `.hwpx`로 표시된 28건, ZIP HWPX가 `.hwp`로 표시된 2건이다. 실제 magic·container를 우선한다.

## 형식별 사양과 실패 경계

| 형식 | 입력과 추출 | 결과·실패 경계 |
| --- | --- | --- |
| HWP `kodit-hwp-ole 0.1.1` | OLE magic과 SHA를 확인하고 `olefile 0.47`로 `FileHeader` 36–40바이트의 압축·암호 플래그를 읽는다. `BodyText/SectionN`을 번호순으로 열어 필요한 경우 raw zlib(`-15`)를 해제하며 record tag 67의 UTF-16LE 문단을 정리한다. | 헤더/섹션/레코드 손상이나 빈 본문은 문서 파싱 실패. 암호 플래그는 읽기를 중단하며, PDF의 `ENCRYPTED` outcome에 억지로 합치지 않는다. 유효 실행의 parser 실패는 0건. |
| HWPX `kodit-hwpx-zipxml 0.1.0` | ZIP magic만으로 확정하지 않는다. `mimetype=application/hwp+zip`, `Contents/content.hpf`, `Contents/header.xml`과 section을 확인한다. 1만 ZIP 항목·총 비압축 크기 512MiB 제한, DOCTYPE·ENTITY 차단 뒤 ElementTree로 번호순 XML 문단·표 셀을 읽는다. | 잘못된 ZIP/XML, 안전 한도 초과, 빈 본문은 문서 파싱 실패. 신원 미해결은 별도 층위. 유효 실행의 parser 실패는 0건. |
| PDF `kodit-pdf-pypdf 0.1.0` | `%PDF-` magic은 입력 선별이며 내부 reader는 **`PdfReader(strict=False)`** 호환 모드다. 페이지마다 텍스트를 읽고 페이지·문자 수, 대체문자율, 한글 비율을 관측한다. | `SUCCESS` 1,719건, `NO_EXTRACTABLE_TEXT` 1건, `ENCRYPTED` 0건, `DOCUMENT/PDF_READ_FAILED` 10건. 구조 오류와 본문 추출 예외는 따로 분류한다. **OCR·신원 판정·이미지 개수 계측은 하지 않으며, 문자 품질 비율은 임계값이 아니다.** |

공유 runtime은 `parser-runtime-contract.json` v1.0.0의 CPython 3.13.7, `olefile==0.47`, `pypdf==6.0.0`으로 고정되었다. 측정 환경은 **Windows 11 / AMD64**다. 후속 호스팅 환경의 동작이라고 전용하지 않는다. 입력 SHA·magic과 parser/engine/lock/source 지문은 실행 출처를 정하며, 각 시도의 outcome·실패 도메인/코드·추출 해시·문자/페이지 계측값은 별도로 기록한다. 현재 저장소 파일의 SHA-256 카드와 과거 실행환경 지문은 서로 다른 시점의 근거다.

## 환경 실패 이력과 오류 해석

보존된 HWP 이전 배치 두 개는 `olefile` import 실패(652회), 패키지 메타데이터만 있고 호출 가능한 `OleFileIO`가 없는 상태(652회)로 **자동 후속 작업이 차단된 환경 실패**다. 옛 결과에는 각 326건이 `PARSE_FAILED`로 기록되어 있지만, 유효한 문서 파서 실행에서 발생한 결함으로 합산하지 않는다. 고정 의존성의 재설치와 환경 지문 복원 뒤 326개 문서/652회 재현 배치에서 parser 실패 0건이었다. 새 실패 분류는 `ENVIRONMENT`, `INPUT_INTEGRITY`, `DOCUMENT`, `EXTRACTION`의 도메인/코드 쌍을 사용하고, 문서 읽기 실패와 신원 불일치·본문 없음은 별개의 결과다.

2026-09-17 원장 적재는 parser 실행 **2,414회**, 고유 바이너리 **2,408개**, 본문이 있는 occurrence **2,403건**, 고유 추출 artifact **2,397개**다. PDF 본문 없음 1건과 읽기 실패 10건에는 빈 extraction artifact를 만들지 않았다. PDF의 특정 representation 오류가 확인된 다른 공식 표현 형식의 규정 버전 공개 결론을 뒤집지는 않는다.

## 코드·로그·계약 위치

| 역할 | 저장소 경로 |
| --- | --- |
| HWP 추출과 실행 | `workers/collector/hwp_parser_runner.py` |
| HWPX ZIP/XML 추출과 실행 | `workers/collector/hwpx_parser.py`, `workers/collector/hwpx_parser_runner.py` |
| PDF 추출과 실행 | `workers/collector/pdf_parser.py`, `workers/collector/pdf_parser_runner.py` |
| 실행/실패 계약 | `workers/collector/parser_runtime.py`, `workers/collector/parser-runtime-contract.json`, `docs/architecture/parser-failure-taxonomy.md`, `docs/architecture/pdf-parser-contract.md` |
| HWP/HWPX 재현 로그 | `reports/measurements/2026-09-13-runtime-v1-reproduction/hwp/batch-run.json`, `reports/measurements/2026-09-13-runtime-v1-reproduction/hwpx/batch-run.json` |
| PDF 전체 실행 로그 | `reports/measurements/2026-09-13-pdf-full-corpus/batch-run.json` |
| 환경 실패 2종 | `reports/measurements/2026-09-13-hwp-corpus/batch/batch-system-python-missing-dependency.json`, `reports/measurements/2026-09-13-hwp-corpus/batch/batch-preserved-pydeps-incomplete.json` |
| 추출 원장 집계 | `reports/measurements/2026-09-17-document-extraction-backfill/summary.json` |

기술 사양 페이지는 이러한 로그의 **검증된 집계와 단계별 동작**만 보여 준다. 원장 행을 다운로드하거나 동적으로 브라우저에서 원시 JSON을 불러오지 않는다.
