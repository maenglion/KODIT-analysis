import Link from "next/link";
import { DiagramViewer } from "@/components/DiagramViewer";
import { ParserEvidence } from "@/components/ParserEvidence";
import { getPublishDataset } from "@/lib/review-data";
import technicalSpecs from "@/data/technical-specs.json";
import parserMeasurements from "@/data/public-parser-measurements.json";

function InformationHero({ eyebrow, title, description, asOf, principle, reviewedOn = "2026-10-02" }: { eyebrow: string; title: string; description: string; asOf: string; principle: string; reviewedOn?: string }) {
  return <>
    <section className="methodology-hero information-hero"><div className="shell"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><span>{description}</span><p className="information-hero-principle">{principle}</p><div className="information-meta"><span>자료 기준 · {asOf}</span><span>설명 검토 · {reviewedOn}</span></div></div></section>
  </>;
}

function InformationSection({ number, title, children, id }: { number: string; title: string; children: React.ReactNode; id?: string }) {
  return <section className="information-section" id={id}><div className="information-section-title"><span>{number}</span><h2>{title}</h2></div><div className="information-section-content">{children}</div></section>;
}

function DiagramPanel({ title, src, alt, caption }: { title: string; src: string; alt: string; caption: string }) {
  return <figure className="information-diagram"><h3>{title}</h3><div className="information-diagram-image"><img src={src} alt={alt} loading="lazy" /></div><figcaption>{caption}</figcaption></figure>;
}

function InformationNext({ text }: { text: string }) {
  return <div className="info-next"><div><h2>자료와 근거를 함께 보세요</h2><p>{text}</p></div><div><Link href="/regulations">규정 공개현황 →</Link><Link href="/residual-data">담당 표기 잔차 →</Link></div></div>;
}

export { DataPurposePage } from "./DataPurposeContent";

const availability = [
  ["FULLTEXT_PUBLIC", "공식 경로에서 해당 규정 버전의 전문 확인"],
  ["PARTIAL_PUBLIC", "전문이 아닌 일부 내용만 공식 경로에서 확인"],
  ["NOTICE_ONLY", "사규예고는 확인되지만 반영된 최종 전문은 미확인"],
  ["SOURCE_UNKNOWN", "현재 보유 근거에서 공식 출처를 결정하지 못함"],
] as const;

export async function MethodologyPage() {
  const { notices, residuals, residualLabels, release } = await getPublishDataset();
  const exactNotices = notices.length - residuals.length;
  return <>
    <InformationHero eyebrow="검증 체계 / 02" title="검증 방법론" description="원본 파일, 추출 본문, 문자열 관측, 의미 판정과 공개 통계를 다른 계층으로 관리합니다. 결론이 어떤 공식 근거와 계약에서 나왔는지 추적할 수 있어야 합니다." asOf={`${release.evidence_as_of} 공개본 / 2026-09-18 잔차 계약`} principle="관측은 보존하고, 의미는 근거가 있을 때만 부여하며, 추정과 확정을 같은 값으로 표시하지 않습니다." />
    <main className="methodology-page information-page"><div className="shell">
      <InformationSection number="01" title="관측에서 분석까지 단계를 분리합니다" id="method-layers">
        <p>원문에서 발견된 문자열과 그 문자열이 뜻하는 조직·규정은 같지 않습니다. SOURCE → OBSERVATION → LABEL → ENTITY/NODE → RELATION → ANALYSIS 계층을 분리합니다. 앞 단계의 존재만으로 다음 계층의 의미를 확정하지 않습니다.</p>
        <DiagramPanel title="원문에서 공개 분석까지" src="/diagrams/evidence-layers.svg" alt="공식 원문에서 관측값과 라벨을 만들고, 근거가 있는 대상과 관계를 거쳐 공개 분석으로 이어집니다. 미해결 관측은 잔차로 남겨 공식 근거를 다시 검토합니다." caption="담당 표기가 인물형이더라도 그 사람의 소속이나 업무 역할은 자동으로 생성하지 않습니다." />
      </InformationSection>
      <InformationSection number="02" title="파일이 아니라 규정 버전을 판정합니다" id="method-availability">
        <p>PDF, HWP, HWPX, 공식 HTML은 한 규정 버전을 나타내는 서로 다른 표현 형식입니다. 공식 경로에서 전문을 담은 형식이 하나라도 확인되면 그 규정 버전의 전문 공개 gate를 충족합니다. PDF 추출 오류 하나가 확인된 다른 형식의 전문 공개를 뒤집지 않습니다.</p>
        <DiagramPanel title="전문 공개의 OR gate" src="/diagrams/version-gate.svg" alt="규정 버전의 공식 PDF, HWP, HWPX, HTML 가운데 한 형식에서 전문이 확인되면 FULLTEXT_PUBLIC, 그렇지 않으면 사규예고와 기타 근거를 더 평가합니다." caption="문서 추출 outcome과 규정 버전의 availability는 별개입니다. OCR은 전문 공개를 만드는 선행 조건이 아닙니다." />
        <div className="information-table-scroll"><table className="information-table"><thead><tr><th scope="col">공개 결론</th><th scope="col">뜻</th></tr></thead><tbody>{availability.map(([key, meaning]) => <tr key={key}><th scope="row"><code>{key}</code></th><td>{meaning}</td></tr>)}</tbody></table></div><p className="information-note"><code>NO_EXTRACTABLE_TEXT</code>, <code>EXTRACTION_FAILED</code>는 parser 결과입니다. <code>REEVALUATION_PENDING</code>도 위 네 가지 공개 availability가 아닙니다.</p>
      </InformationSection>
      <InformationSection number="03" title="같은 파일과 같은 글의 identity를 따로 관리합니다" id="method-integrity">
        <div className="information-use-grid information-identity-grid"><article><span>01 / BINARY</span><h3>SHA-256</h3><p>동일한 원본 바이너리인가?</p></article><article><span>02 / TEXT</span><h3>extract_hash</h3><p>추출된 본문이 동일한가?</p></article><article><span>03 / RULE</span><h3>extraction contract</h3><p>어떤 추출 규칙으로 본문을 만들었는가?</p></article></div>
        <p>성공과 실패를 포함한 parser 실행은 실행마다 별도 기록으로 보존합니다. 같은 바이너리·같은 계약·같은 추출 본문이 재현되면 실행 이력은 새로 남기되 기존 immutable extraction artifact를 재사용할 수 있습니다. 실패나 본문 없음은 실행 기록만 남기고 빈 본문을 만들지 않습니다.</p>
        <blockquote>SHA로 같은 파일을 확인하고, extract_hash로 같은 글을 고정한 뒤 그 글 안의 언급을 셉니다.</blockquote>
      </InformationSection>
      <InformationSection number="04" title="해결하지 못한 담당 표기도 남겨 둡니다" id="method-residual">
        <p>현재 승인 공개본의 사규예고 {notices.length.toLocaleString("ko-KR")}건 중 공식 조직명과 정확히 일치한 게시물은 {exactNotices.toLocaleString("ko-KR")}건입니다. 나머지 <strong>{residuals.length.toLocaleString("ko-KR")}건은 게시물에 귀속된 잔차 occurrence</strong>로 보존하며, 사람 수나 서로 다른 이름의 개수가 아닙니다. 서로 다른 lexical label은 {residualLabels.length.toLocaleString("ko-KR")}개입니다.</p>
        <div className="information-metric-grid"><div><span>사규예고</span><strong>{notices.length.toLocaleString("ko-KR")}건</strong></div><div><span>조직명 exact match</span><strong>{exactNotices.toLocaleString("ko-KR")}건</strong></div><div><span>잔차 occurrence</span><strong>{residuals.length.toLocaleString("ko-KR")}건</strong></div><div><span>lexical label</span><strong>{residualLabels.length.toLocaleString("ko-KR")}개</strong></div></div>
        <p>잔차와 추출 언급은 각자 라벨에 묶이고, 조직 후보·근거·경로는 별도 원장으로 보존됩니다. 후보 점수나 이름 유사도만으로 공식 조직이 되지 않습니다. <b>조직개편·업무귀속 path에는 공식 근거문서가 필요합니다.</b></p>
        <DiagramViewer />
        <p className="information-note">제공받은 ERD는 관계·필드명만 보여 줍니다. 공개 화면은 내부 실행 ID, 문서별 해시, 신뢰도 점수나 비마스킹 이름을 표시하지 않습니다. 상세 UI에서는 ‘상태’보다 ‘추론 근거’와 확인 경로를 먼저 읽습니다.</p>
      </InformationSection>
      <InformationSection number="05" title="검증 계약을 통과하지 못하면 자동 적용하지 않습니다" id="method-stop">
        <p>known-answer positive control과 시점에 맞는 공식 조직·업무 profile, calibration, 독립 holdout을 함께 평가합니다. 정답을 누설할 수 있는 담당부서 원문이나 사람 이름을 resolver 입력으로 사용하지 않습니다.</p><p>표본 수, coverage, top-1 accuracy, top-3 recall, 모호성, 후보 없음 비중까지 살핍니다. 최소 표본과 독립 검증 기준을 충족하지 못하면 잔차 1,272건에 자동 귀속 결과를 적용하지 않습니다. 단일 ‘신뢰도 1~5’ 점수로 이 경계를 감추지 않습니다.</p>
      </InformationSection>
      <InformationNext text="방법론 설명은 개별 규정에 대한 법적 판단이 아닙니다. 원문 출처와 조직 잔차를 별도로 확인해 주세요." />
    </div></main>
  </>;
}

export async function TechnicalSpecsPage() {
  const { release, rows, notices, sources } = await getPublishDataset();
  const artifactCount = technicalSpecs.reduce((total, spec) => total + spec.artifacts.length, 0);
  return <>
    <InformationHero eyebrow="기술 사양 / 03" title="공개·수집 시스템 구성" description="수집, 문서 판별, 본문 추출, 근거 원장, 정적 공개본을 저장소의 실제 코드와 실행 로그로 설명합니다. 문서별 실행 provenance가 아니라 공개 가능한 구성과 집계만 표시합니다." asOf={`${release.evidence_as_of} 공개본 / ${parserMeasurements.measuredAt} parser 원장`} principle="존재하는 artifact만 표시하고, parser 실행 결과와 규정의 공개 결론을 하나의 값으로 섞지 않습니다." reviewedOn="2026-10-03" />
    <main className="methodology-page information-page technical-information-page"><div className="shell">
      <InformationSection number="01" title="공식 원문에서 정적 공개 화면까지" id="spec-flow">
        <p>공식 게시물과 첨부를 보존한 뒤 확장자에만 의존하지 않고 실제 magic과 container 구조를 확인합니다. PDF, OLE HWP, ZIP HWPX runner의 추출 결과는 실행·본문 원장에 분리해 보존됩니다. 승인된 공개본만 공개 안전 필드의 versioned snapshot으로 내보냅니다.</p>
        <div className="information-metric-grid"><div><span>확인된 component</span><strong>{technicalSpecs.length}개</strong></div><div><span>정본 artifact</span><strong>{artifactCount}개</strong></div><div><span>원장 parser 실행</span><strong>{parserMeasurements.ledger.parserRuns.toLocaleString("ko-KR")}건</strong></div><div><span>고유 추출 본문</span><strong>{parserMeasurements.ledger.uniqueExtractions.toLocaleString("ko-KR")}건</strong></div></div>
        <DiagramPanel title="수집·추출·공개 경로" src="/diagrams/technical-pipeline.svg" alt="KODIT와 ALIO 공식 자료에서 첨부·바이너리를 보존하고 SHA와 magic으로 PDF, HWP, HWPX runner를 선택합니다. 실행·추출 원장을 거쳐 승인된 공개본만 정적 snapshot으로 공개 화면에 전달됩니다." caption="형식 판별은 확장자가 아닌 파일 magic과 구조를 우선합니다. 파일명이 HWP여도 내용이 HWPX이면 ZIP HWPX로 구분합니다." />
      </InformationSection>
      <InformationSection number="02" title="형식별 parser와 실제 재현 결과" id="spec-parser">
        <p>다음 수치는 2026-09-13의 보존 corpus 재현 실행과 2026-09-17의 추출 원장 적재 결과입니다. 각 문서를 두 번 실행해 추출 해시 재현성 이상 0건을 확인했습니다. <b>HWP/HWPX 신원 미해결은 parser 실패가 아닙니다.</b></p>
        <ParserEvidence />
      </InformationSection>
      <InformationSection number="03" title="세 parser가 공유하는 실행·실패 계약" id="spec-runtime">
        <p>Runtime 계약 {parserMeasurements.runtime.contract}: {parserMeasurements.runtime.python}, <code>olefile=={parserMeasurements.runtime.olefile}</code>, <code>pypdf=={parserMeasurements.runtime.pypdf}</code>를 저장소의 고정 의존성에서 확인합니다. HWPX 본문 parser는 Python 표준 라이브러리 ZIP/XML을 사용합니다. 실행 환경, 입력 무결성, 문서 구조, 본문 추출 실패를 서로 다른 원인으로 기록합니다.</p>
        <div className="information-use-grid information-runtime-grid"><article><span>INPUT</span><h3>입력 식별</h3><p>보존 바이너리 SHA-256과 실제 magic 확인</p></article><article><span>EXECUTION</span><h3>실행 조건</h3><p>parser·engine 버전, 코드·lock hash와 환경 지문 기록</p></article><article><span>OUTPUT</span><h3>결과 구분</h3><p>실행 시간·outcome·실패 분류·추출 해시와 문자 수</p></article></div>
        <div className="information-table-scroll"><table className="information-table"><thead><tr><th scope="col">실패 도메인</th><th scope="col">대표 코드</th><th scope="col">의미</th></tr></thead><tbody><tr><th scope="row">ENVIRONMENT</th><td>DEPENDENCY_IMPORT_FAILED<br />RUNTIME_CONTRACT_FAILED</td><td>의존성 또는 고정 실행환경 불일치</td></tr><tr><th scope="row">INPUT_INTEGRITY</th><td>SHA256_MISMATCH<br />MAGIC_MISMATCH</td><td>보존 입력의 무결성 또는 형식 불일치</td></tr><tr><th scope="row">DOCUMENT</th><td>PARSE_FAILED<br />PDF_READ_FAILED<br />PDF_STRUCTURE_INVALID</td><td>문서 구조 읽기 실패</td></tr><tr><th scope="row">EXTRACTION</th><td>TEXT_EXTRACTION_FAILED</td><td>구조는 열었지만 본문 추출에 실패</td></tr></tbody></table></div><p className="information-note">SUCCESS와 NO_EXTRACTABLE_TEXT는 실패 코드가 아닙니다. PDF의 ENCRYPTED 또한 별도 outcome이며, HWP 암호 플래그 실패나 HWP/HWPX 신원 불일치와 혼동하지 않습니다. PDF 본문 없음·읽기 실패 11건에는 빈 extraction artifact를 만들지 않습니다.</p>
      </InformationSection>
      <InformationSection number="04" title="실제 코드로 확인된 구성 요소" id="spec-components">
        <p>9개 component의 버전·최종 변경일·파일 SHA-256은 저장소에 존재하는 11개 canonical artifact의 실제 바이트와 대조했습니다. 이 값은 <b>코드 파일의 해시</b>이며 개별 규정 문서의 SHA-256이 아닙니다.</p>
        <div className="spec-grid">{technicalSpecs.map((spec) => <article className="spec-card" key={spec.name}><div className="spec-head"><h3>{spec.name}</h3><span className={`spec-status ${spec.status}`}>{spec.status}</span></div><p>{spec.role}</p><dl><div><dt>버전</dt><dd>{spec.version}</dd></div><div><dt>최종 변경일</dt><dd>{spec.updatedAt}</dd></div></dl><div className="artifact-list">{spec.artifacts.map((artifact) => <div className="artifact" key={artifact.path}><b>정본 코드 경로</b><code>{artifact.path}</code><details><summary>파일 SHA-256 · {artifact.sha256.slice(0, 16)}… 전체 보기</summary><code>{artifact.sha256}</code></details></div>)}</div></article>)}</div>
      </InformationSection>
      <InformationSection number="05" title="수집 주기와 공개 승인은 다른 단계입니다" id="spec-release">
        <p>10-day collection workflow는 마지막 성공 수집일에서 10일 경과 여부를 확인해 수집을 제어합니다. 수집 성공이 곧바로 공개 화면을 갱신하지 않습니다. 검증·projection과 별도 승인 후 public-safe snapshot을 다시 내보내야 합니다.</p>
        <div className="information-metric-grid"><div><span>현재 규정 버전</span><strong>{rows.length.toLocaleString("ko-KR")}건</strong></div><div><span>사규예고</span><strong>{notices.length.toLocaleString("ko-KR")}건</strong></div><div><span>공개 source</span><strong>{sources.length.toLocaleString("ko-KR")}건</strong></div><div><span>근거 기준일</span><strong>{release.evidence_as_of}</strong></div></div>
        <p>현재 브라우저는 공개본의 <code>public-snapshot-v1.json.gz</code>를 읽으며 매 요청마다 Supabase RPC를 호출하지 않습니다. 기존 승인 release와 RPC 계약은 외부 검증·추후 갱신을 위해 보존합니다. parser 원장의 2026-09-17 관측 수치와 위 공개본의 2026-09-13 기준 수치를 같은 시점의 집계로 합산하지 않습니다.</p>
        <p className="information-note">parser 원장 {parserMeasurements.ledger.parserRuns.toLocaleString("ko-KR")}회 실행 중 본문이 있는 occurrence {parserMeasurements.ledger.nonemptyOccurrences.toLocaleString("ko-KR")}건은 고유 추출 artifact {parserMeasurements.ledger.uniqueExtractions.toLocaleString("ko-KR")}건으로 보존됐습니다. 로그 출처: <code>{parserMeasurements.ledger.report}</code></p>
      </InformationSection>
      <InformationNext text="기술 사양은 재현 가능한 저장소 artifact와 집계에 한정합니다. 개별 문서의 내부 실행 정보는 공개하지 않습니다." />
    </div></main>
  </>;
}
