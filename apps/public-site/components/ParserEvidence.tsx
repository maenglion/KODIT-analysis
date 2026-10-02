import parserMeasurements from "@/data/public-parser-measurements.json";

const processingSteps = {
  HWP: [
    ["입력·무결성", "OLE magic과 보존 입력 SHA-256을 확인한 뒤, 고정 runtime과 olefile 0.47의 import 가능 여부를 검증합니다."],
    ["구조·본문", "OLE FileHeader의 36~40바이트에서 압축·암호 플래그를 읽습니다. BodyText/Section을 번호순으로 열고, 압축이면 raw zlib(-15)로 해제한 뒤 record tag 67의 UTF-16LE 문단을 이어 붙입니다."],
    ["실패·경계", "헤더 누락·절단, 암호 플래그, 섹션 부재, 레코드 손상 또는 빈 본문은 읽기 실패로 분리합니다. HWP 암호 플래그는 PDF의 ENCRYPTED outcome으로 합치지 않습니다."],
    ["신원 판정", "추출 성공 뒤에 별도 이름 기준과 본문 일치를 평가합니다. 파일명만으로 규정 신원을 만들지 않습니다."],
  ],
  HWPX: [
    ["입력·무결성", "ZIP magic만으로 확정하지 않고 mimetype(application/hwp+zip), Contents/content.hpf, Contents/header.xml, section XML의 존재를 확인합니다."],
    ["구조·본문", "ZIP 항목 1만 개·압축 해제 총량 512MiB 제한을 검사합니다. Contents/sectionN.xml을 번호순으로 읽고 DOCTYPE·ENTITY 선언을 차단한 다음 ElementTree로 문단과 표 셀을 추출합니다."],
    ["실패·경계", "구조가 다른 ZIP, 제한 초과, XML 파싱 오류와 빈 본문은 규정 신원 불일치와 별도로 기록합니다. 확장자가 .hwp여도 확인된 내용이 HWPX면 HWPX 경로로 분류합니다."],
    ["신원 판정", "추출 뒤 보존된 첨부 기준명과 본문을 비교합니다. 5건의 미해결은 실패가 아니라 신원 참조 누락 또는 본문 표기 차이입니다."],
  ],
  PDF: [
    ["입력·무결성", "%PDF- magic과 보존 입력 SHA-256을 검증합니다. '엄격한 PDF 대상 선택'과 pypdf PdfReader(strict=False)의 호환 읽기 모드는 서로 다른 단계입니다."],
    ["구조·본문", "암호화 여부와 페이지 목록을 확인하고 페이지마다 extract_text()를 호출합니다. 페이지 수, 본문 문자 수, 텍스트가 있는 페이지, 대체 문자율과 한글 비율을 관측합니다."],
    ["실패·경계", "암호화는 ENCRYPTED, 읽히지만 텍스트가 없으면 NO_EXTRACTABLE_TEXT, 구조 읽기 오류는 DOCUMENT/PDF_READ_FAILED 또는 PDF_STRUCTURE_INVALID, 페이지 본문 예외는 EXTRACTION/TEXT_EXTRACTION_FAILED입니다."],
    ["해석 제한", "OCR과 규정 신원 판정은 하지 않습니다. 한글 비율·대체 문자율은 관측 지표이지 성공/실패 임계값이 아닙니다. 이미지 객체 개수는 집계하지 않습니다."],
  ],
} as const;

export function ParserEvidence() {
  const { formats, audit, runtime } = parserMeasurements;
  return <>
    <div className="parser-audit-strip" aria-label="재현 실행 로그 요약">
      <div><span>보존 문서</span><strong>{formats.reduce((sum, item) => sum + item.documents, 0).toLocaleString("ko-KR")}건</strong></div>
      <div><span>2회 재현 시도</span><strong>{audit.replayAttempts.toLocaleString("ko-KR")}회</strong></div>
      <div><span>추출 해시 불일치</span><strong>{audit.reproducibilityAnomalies}건</strong></div>
      <div><span>실측 환경</span><strong className="parser-platform">{runtime.measuredPlatform}</strong></div>
    </div>
    <p className="parser-context">2026-09-13 보존 corpus의 형식별 재실행을 대조한 값입니다. 2026-09-17 원장 적재의 {parserMeasurements.ledger.parserRuns.toLocaleString("ko-KR")}회는 별도 단계의 집계이므로 재현 시도와 합산하지 않습니다.</p>
    <div className="parser-result-grid">
      {formats.map((format) => <article className="parser-result-card" key={format.format}>
        <div className="parser-result-heading"><span>{format.format}</span><strong>{format.documents.toLocaleString("ko-KR")}<small>개 문서</small></strong></div>
        <h3>{format.parser} <small>v{format.version}</small></h3>
        <p>엔진: {format.engine} · 문서마다 두 번 실행해 동일 결과·추출 해시를 확인했습니다.</p>
        <dl>
          <div><dt>재현 실행</dt><dd>{format.attempts.toLocaleString("ko-KR")}회</dd></div>
          {"parsedAndIdentified" in format ? <>
            <div><dt>본문 추출·신원 확인</dt><dd>{format.parsedAndIdentified}건</dd></div>
            <div><dt>추출 성공 / 신원 미해결</dt><dd>{format.parsedIdentityUnresolved}건</dd></div>
            <div><dt>기준명 참조 없음</dt><dd>{format.referenceMissing}건</dd></div>
            <div><dt>기준명과 본문 표기 불일치</dt><dd>{format.textMismatch}건</dd></div>
            <div><dt>확장자·실제 형식 불일치</dt><dd>{format.extensionMismatch}건</dd></div>
            <div><dt>유효 배치 parser 실패</dt><dd>{format.parserFailed}건</dd></div>
          </> : <>
            <div><dt>본문 추출</dt><dd>{format.extracted}건</dd></div>
            <div><dt>본문 없는 문서</dt><dd>{format.noText}건</dd></div>
            <div><dt>암호화 문서</dt><dd>{format.encrypted}건</dd></div>
            <div><dt>문서 읽기 실패</dt><dd>{format.readFailed}건</dd></div>
            <div><dt>중앙값: 페이지 / 본문 문자</dt><dd>{format.medianPages}쪽 / {format.medianCharacters}자</dd></div>
          </>}
        </dl>
        <details className="parser-operation-details"><summary>처리 단계와 실패 조건 보기</summary>
          <ol>{processingSteps[format.format as keyof typeof processingSteps].map(([title, description]) => <li key={title}><strong>{title}</strong><p>{description}</p></li>)}</ol>
          <p className="parser-log-source">집계 근거: <code>{format.report}</code></p>
        </details>
      </article>)}
    </div>
    <div className="parser-findings">
      <h3>실행 로그 해석 시 주의할 경계</h3>
      <ul>
        <li>HWP/HWPX의 <strong>신원 미해결 {audit.identityReferenceMissing + audit.identityTextMismatch}건</strong>은 본문 추출에 성공했습니다. 그중 기준명 참조 누락 {audit.identityReferenceMissing}건, 본문 표기 차이 {audit.identityTextMismatch}건이며 문서 parser 실패로 계산하지 않습니다.</li>
        <li>확장자와 실제 형식의 불일치 <strong>{audit.extensionMismatches}건</strong>은 magic·container에 따라 처리했습니다. HWP를 .hwpx로 표시한 28건과 HWPX를 .hwp로 표시한 2건입니다.</li>
        <li>PDF 읽기 실패 <strong>10건</strong>은 이 PDF 표현 형식의 DOCUMENT/PDF_READ_FAILED입니다. 다른 공식 표현 형식의 존재나 규정 버전 공개 판정을 자동으로 뒤집지 않습니다. PDF는 OCR·규정 신원 판정을 수행하지 않았습니다.</li>
        <li>HWP의 유효 실행 전에 <strong>{audit.priorEnvironmentBlockedBatches}개 환경 미충족 배치</strong>가 있었습니다. olefile import 실패와 import 가능한 API 부재로 자동 후속 작업이 차단된 기록이며, 옛 로그의 PARSE_FAILED 표기를 유효 배치의 문서 오류에 합산하지 않았습니다.</li>
      </ul>
      <p>위 값은 당시 <strong>{runtime.measuredPlatform}</strong> 측정 로그입니다. 현재 저장소에 표시하는 코드 파일 SHA-256과 과거 실행환경 지문은 서로 다른 증거입니다. 문서별 경로·해시·실행 ID·오류 전문은 공개하지 않습니다.</p>
    </div>
  </>;
}
