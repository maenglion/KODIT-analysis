import Link from "next/link";
import { CollectionStatus } from "@/components/CollectionStatus";
import { DiagramViewer } from "@/components/DiagramViewer";
import { ParserEvidence } from "@/components/ParserEvidence";
import { getPublishDataset } from "@/lib/review-data";
import technicalSpecs from "@/data/technical-specs.json";
import parserMeasurements from "@/data/public-parser-measurements.json";

function InformationHero({ eyebrow, title, description, evidenceAsOf, snapshotGeneratedAt, additionalBases = [], principle }: { eyebrow: string; title: string; description: string; evidenceAsOf: string; snapshotGeneratedAt: string; additionalBases?: { label: string; date: string }[]; principle: string }) {
  return <>
    <section className="methodology-hero information-hero"><div className="shell information-hero-inner"><div className="information-hero-main"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><span>{description}</span><p className="information-hero-principle">{principle}</p></div><CollectionStatus evidenceAsOf={evidenceAsOf} basisLabel="규정·예고" additionalBases={additionalBases} snapshotGeneratedAt={snapshotGeneratedAt} generationSource="규정 공개본" /></div></section>
  </>;
}

function InformationSection({ number, title, children, id }: { number: string; title: string; children: React.ReactNode; id?: string }) {
  return <section className="information-section" id={id}><div className="information-section-title"><span>{number}</span><h2>{title}</h2></div><div className="information-section-content">{children}</div></section>;
}

function DiagramPanel({ title, src, alt, caption }: { title: string; src: string; alt: string; caption: string }) {
  return <figure className="information-diagram"><h3>{title}</h3><div className="information-diagram-image"><img src={src} alt={alt} loading="lazy" /></div><figcaption>{caption}</figcaption></figure>;
}

function InformationRelated({ links }: { links: { href: string; label: string }[] }) {
  return <nav className="purpose-related" aria-label="관련 페이지"><h2>관련 페이지</h2><ul>{links.map((link) => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}</ul></nav>;
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
    <InformationHero eyebrow="검증 체계 / 02" title="검증 방법론" description="원본 파일, 추출 본문, 문자열 관측, 의미 판정과 공개 통계를 다른 계층으로 관리합니다." evidenceAsOf={release.evidence_as_of} snapshotGeneratedAt={release.generated_at} principle="관측은 보존하고, 의미는 근거가 있을 때만 부여합니다." />
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
      <InformationRelated links={[{ href: "/regulations", label: "규정 공개 현황" }, { href: "/residual-data", label: "담당 표기 잔차" }, { href: "/technical-specs", label: "기술 사양" }]} />
    </div></main>
  </>;
}

export async function TechnicalSpecsPage() {
  const { release, rows, notices, sources } = await getPublishDataset();
  const artifactCount = technicalSpecs.reduce((total, spec) => total + spec.artifacts.length, 0);
  const componentTitles: Record<string, string> = {
    "HWP parser / runner": "HWP 본문 추출·실행기", "HWPX parser / runner": "HWPX 본문 추출·실행기",
    "PDF parser / runner": "PDF 본문 추출·실행기", "DRMONE/FASOO classifier": "문서 컨테이너 형식 판별기",
    "Parser runtime contract": "파서 실행환경 고정", Collector: "공식 자료 수집기",
    "10-day collection workflow": "수집 주기 제어", "Publish schema": "공개 데이터 스키마",
    "Baseline projection": "공개용 데이터 투영",
  };
  return <>
    <InformationHero eyebrow="기술 사양 / 03" title="수집·추출·공개 시스템 기술 사양" description="공식 자료 수집부터 형식 판별, 본문 추출·원장 기록과 공개본 생성까지의 구조를 설명합니다. 문서별 경로·해시·실행 ID·오류 전문은 공개하지 않습니다." evidenceAsOf={release.evidence_as_of} snapshotGeneratedAt={release.generated_at} additionalBases={[{ label: "parser 원장", date: parserMeasurements.measuredAt }]} principle="parser 실행 결과와 규정의 공개 결론은 별개입니다." />
    <main className="methodology-page information-page technical-information-page"><div className="shell">
      <InformationSection number="01" title="전체 처리 구조" id="spec-flow">
        <p>공식 게시물과 첨부를 보존하고 실제 파일 구조로 형식을 판별합니다. 실행 기록과 본문 산출물을 분리해 저장하며, 검증·공개 승인 후에만 정적 공개본을 생성합니다.</p>
        <div className="information-metric-grid"><div><span>등록된 구성요소</span><strong>{technicalSpecs.length}개</strong></div><div><span>정본 파일 경로</span><strong>{artifactCount}개</strong></div><div><span>원장 parser 실행 기록</span><strong>{parserMeasurements.ledger.parserRuns.toLocaleString("ko-KR")}건</strong></div><div><span>원장 고유 추출 산출물</span><strong>{parserMeasurements.ledger.uniqueExtractions.toLocaleString("ko-KR")}건</strong></div></div>
        <p>2026-09-13 보존 문서 {parserMeasurements.formats.reduce((total, format) => total + format.documents, 0).toLocaleString("ko-KR")}개를 각각 두 번 실행해 {parserMeasurements.audit.replayAttempts.toLocaleString("ko-KR")}회를 재현성 대조했습니다. 2026-09-17 추출 원장의 {parserMeasurements.ledger.parserRuns.toLocaleString("ko-KR")}건은 별도의 실행 기록입니다. 그중 본문이 있는 실행 관측 {parserMeasurements.ledger.nonemptyOccurrences.toLocaleString("ko-KR")}건과 고유 추출 산출물 {parserMeasurements.ledger.uniqueExtractions.toLocaleString("ko-KR")}건도 집계 단위가 다릅니다.</p>
        <DiagramPanel title="수집·추출·공개 경로" src="/diagrams/technical-pipeline.svg" alt="KODIT와 ALIO 공식 자료에서 첨부·바이너리를 보존하고 SHA와 magic으로 PDF, HWP, HWPX runner를 선택합니다. 실행·추출 원장을 거쳐 검증과 공개 승인을 통과한 정적 snapshot만 공개 화면에 전달됩니다." caption="이 다이어그램의 실행·추출 원장은 별도 기록이며, parser 성공이 곧 공개 승인을 뜻하지 않습니다. 형식은 확장자보다 파일 구조로 확인합니다." />
      </InformationSection>
      <InformationSection number="02" title="문서 형식별 parser 및 재현 결과" id="spec-parser">
        <p>다음 수치는 2026-09-13의 보존 corpus 재현 실행과 2026-09-17의 추출 원장 적재 결과입니다. 각 문서를 두 번 실행해 추출 해시 재현성 이상 0건을 확인했습니다. <b>HWP/HWPX 신원 미해결은 parser 실패가 아닙니다.</b></p>
        <ParserEvidence />
      </InformationSection>
      <InformationSection number="03" title="공통 실행환경 및 오류 분류" id="spec-runtime">
        <p>세 parser에는 동일한 실행환경 고정 규칙({parserMeasurements.runtime.contract})과 오류 분류 기준을 적용합니다. 실측 환경은 {parserMeasurements.runtime.python}, <code>olefile=={parserMeasurements.runtime.olefile}</code>, <code>pypdf=={parserMeasurements.runtime.pypdf}</code>입니다. HWPX 본문 추출은 Python 표준 라이브러리 ZIP/XML을 사용합니다.</p>
        <div className="information-use-grid information-runtime-grid"><article><span>INPUT</span><h3>입력 식별</h3><p>보존 바이너리 SHA-256과 실제 magic 확인</p></article><article><span>EXECUTION</span><h3>실행 조건</h3><p>parser·engine 버전, 코드·lock hash와 환경 지문 기록</p></article><article><span>OUTPUT</span><h3>결과 구분</h3><p>실행 시간·outcome·실패 분류·추출 해시와 문자 수</p></article></div>
        <div className="information-table-scroll"><table className="information-table"><thead><tr><th scope="col">실패 도메인</th><th scope="col">대표 코드</th><th scope="col">의미</th></tr></thead><tbody><tr><th scope="row">ENVIRONMENT</th><td>DEPENDENCY_IMPORT_FAILED<br />RUNTIME_CONTRACT_FAILED</td><td>의존성 또는 고정 실행환경 불일치</td></tr><tr><th scope="row">INPUT_INTEGRITY</th><td>SHA256_MISMATCH<br />MAGIC_MISMATCH</td><td>보존 입력의 무결성 또는 형식 불일치</td></tr><tr><th scope="row">DOCUMENT</th><td>PARSE_FAILED<br />PDF_READ_FAILED<br />PDF_STRUCTURE_INVALID</td><td>문서 구조 읽기 실패</td></tr><tr><th scope="row">EXTRACTION</th><td>TEXT_EXTRACTION_FAILED</td><td>구조는 열었지만 본문 추출에 실패</td></tr></tbody></table></div><p className="information-note">SUCCESS와 NO_EXTRACTABLE_TEXT는 실패 코드가 아닙니다. PDF의 ENCRYPTED 또한 별도 outcome이며, HWP 암호 플래그 실패나 HWP/HWPX 신원 불일치와 혼동하지 않습니다. PDF 본문 없음·읽기 실패 11건에는 빈 extraction artifact를 만들지 않습니다.</p>
      </InformationSection>
      <InformationSection number="04" title="구성요소 및 정본 파일 식별값" id="spec-components">
        <p>등록된 9개 구성요소의 버전·변경일과 11개 정본 파일 경로를 대조했습니다. 파일 SHA-256은 <b>표시된 코드·설정·워크플로·스키마 파일</b>을 식별하는 값이지 원문 문서의 해시가 아닙니다. 해시 표시는 소스코드 자체의 공개를 뜻하지 않습니다.</p>
        <div className="spec-grid">{technicalSpecs.map((spec) => <article className="spec-card" key={spec.name}><div className="spec-head"><h3>{componentTitles[spec.name] ?? spec.name}</h3><span className={`spec-status ${spec.status}`}>{spec.status}</span></div><p><code>{spec.name}</code> · {spec.role}</p><dl><div><dt>버전</dt><dd>{spec.version}</dd></div><div><dt>최종 변경일</dt><dd>{spec.updatedAt}</dd></div></dl><div className="artifact-list">{spec.artifacts.map((artifact) => <div className="artifact" key={artifact.path}><b>정본 파일 경로</b><code>{artifact.path}</code><details><summary>파일 SHA-256 · {artifact.sha256.slice(0, 16)}… 전체 보기</summary><code>{artifact.sha256}</code></details></div>)}</div></article>)}</div>
      </InformationSection>
      <InformationSection number="05" title="수집 주기와 공개본 갱신" id="spec-release">
        <p>수집기는 마지막 성공 기록으로부터 기본 10일 간격을 확인합니다. 수집 결과는 검증·공개용 데이터 변환·승인을 거친 뒤 공개 snapshot에 반영됩니다. 수집일과 공개 데이터 기준일이 달라도 공개 화면이 자동으로 갱신된 것은 아닙니다.</p>
        <div className="information-metric-grid"><div><span>현재 규정 버전</span><strong>{rows.length.toLocaleString("ko-KR")}건</strong></div><div><span>사규예고</span><strong>{notices.length.toLocaleString("ko-KR")}건</strong></div><div><span>공개 source</span><strong>{sources.length.toLocaleString("ko-KR")}건</strong></div><div><span>근거 기준일</span><strong>{release.evidence_as_of}</strong></div></div>
        <p>공개 규정·예고 데이터는 배포된 <code>public-snapshot-v1.json.gz</code>를 Next 서버에서 읽어 화면에 전달합니다. 규정 목록을 요청할 때마다 내부 원장이나 Supabase RPC를 조회하지 않습니다. 브라우저의 <code>/api/collection-state</code> 요청은 <b>수집 상태</b>만 표시하는 별도 경로입니다. 화면의 CSV 내려받기는 승인 데이터의 필터 결과를 만들며, 서버의 규정 전달 포맷이 아닙니다.</p>
        <p className="information-note">공개 규정 기준일 {release.evidence_as_of}, 별도 parser 원장 측정일 {parserMeasurements.measuredAt}과 공개본 생성일 {release.generated_at.slice(0, 10)}은 서로 다른 단계입니다. 추출 원장 보고서: <code>{parserMeasurements.ledger.report}</code></p>
      </InformationSection>
      <InformationRelated links={[{ href: "/data-purpose", label: "데이터 수집 및 활용목적" }, { href: "/methodology", label: "검증 방법론" }, { href: "/regulations", label: "규정 공개 현황" }]} />
    </div></main>
  </>;
}
