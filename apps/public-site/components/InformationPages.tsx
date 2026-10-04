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
  const { notices, residuals, residualLabels, personResidualObservations, release } = await getPublishDataset();
  const residualOccurrenceCount = residuals.length + personResidualObservations.length;
  const residualLabelCount = residualLabels.length + new Set(personResidualObservations.map(row => row.public_alias)).size;
  const exactNotices = notices.length - residualOccurrenceCount;
  return <>
    <InformationHero eyebrow="검증 체계 / 02" title="판정 근거와 검증 구조" description="문서를 읽은 결과와 그 결과에 의미를 부여한 판단을 섞지 않기 위해, 원본·추출·관측·판정·공개를 각각 분리해 기록합니다." evidenceAsOf={release.evidence_as_of} snapshotGeneratedAt={release.generated_at} principle="확인한 범위까지만 확정하고, 근거가 끊긴 지점은 그대로 남깁니다." />
    <main className="methodology-page information-page"><div className="shell">
      <InformationSection number="01" title="원문·관측·판정의 분리" id="method-layers">
        <p>문서에서 문자열이 발견되었다는 사실과 그것이 특정 조직이나 규정을 뜻한다는 판단은 다릅니다. SOURCE → OBSERVATION → LABEL → ENTITY/NODE → RELATION → ANALYSIS를 분리해, 앞 단계의 관측만으로 다음 단계의 의미가 자동 확정되지 않도록 했습니다.</p>
        <DiagramPanel title="원문에서 판정 결과까지" src="/diagrams/evidence-layers.svg" alt="공식 원문에서 관측값과 라벨을 만들고, 근거가 있는 대상과 관계를 거쳐 공개 분석으로 이어집니다. 미해결 관측은 잔차로 남겨 공식 근거를 다시 검토합니다." caption="인물형 표기가 관측되어도 별도 근거가 없으면 소속이나 업무관계를 만들지 않습니다." />
      </InformationSection>
      <InformationSection number="02" title="규정 버전 단위의 공개 판정" id="method-availability">
        <p>PDF·HWP·HWPX·공식 HTML은 같은 규정 버전을 보여주는 서로 다른 형식입니다. 공식 경로 중 하나에서 전문이 확인되면 해당 규정 버전을 전문 공개로 판정하며, 특정 파일의 추출 실패가 다른 공식 형식에서 확인된 공개 상태를 뒤집지는 않습니다.</p>
        <DiagramPanel title="규정 버전의 전문 확인 기준" src="/diagrams/version-gate.svg" alt="규정 버전의 공식 PDF, HWP, HWPX, HTML 가운데 한 형식에서 전문이 확인되면 FULLTEXT_PUBLIC, 그렇지 않으면 사규예고와 기타 근거를 더 평가합니다." caption="문서 추출 결과와 규정 버전의 공개 상태는 별도로 판정합니다." />
        <div className="information-table-scroll"><table className="information-table"><thead><tr><th scope="col">공개 결론</th><th scope="col">뜻</th></tr></thead><tbody>{availability.map(([key, meaning]) => <tr key={key}><th scope="row"><code>{key}</code></th><td>{meaning}</td></tr>)}</tbody></table></div><p className="information-note"><code>NO_EXTRACTABLE_TEXT</code>, <code>EXTRACTION_FAILED</code>는 parser 결과입니다. <code>REEVALUATION_PENDING</code>도 위 네 가지 공개 availability가 아닙니다.</p>
      </InformationSection>
      <InformationSection number="03" title="원본·추출문·추출 규칙의 식별" id="method-integrity">
        <p>같은 원본이라도 파서나 추출 규칙이 바뀌면 본문 결과가 달라질 수 있습니다. 그래서 원본 바이너리, 추출된 본문, 적용한 추출 규칙을 서로 다른 식별값으로 관리합니다.</p>
        <div className="information-use-grid information-identity-grid"><article><span>01 / BINARY</span><h3>SHA-256</h3><p>동일한 원본 바이너리인가?</p></article><article><span>02 / TEXT</span><h3>extract_hash</h3><p>추출된 본문이 동일한가?</p></article><article><span>03 / RULE</span><h3>extraction contract</h3><p>어떤 추출 규칙으로 본문을 만들었는가?</p></article></div>
        <blockquote>같은 파일인지, 같은 본문인지, 같은 규칙으로 읽었는지를 각각 확인합니다.</blockquote>
      </InformationSection>
      <InformationSection number="04" title="미분류 담당표기의 잔차 보존" id="method-residual">
        <p>현재 조직명과 정확히 일치하지 않는 담당표기를 오류로 삭제하거나 임의로 현행 조직에 배정하지 않았습니다. {residualOccurrenceCount.toLocaleString("ko-KR")}건은 게시물 단위의 잔차 occurrence로, {residualLabelCount.toLocaleString("ko-KR")}개는 서로 다른 lexical label로 각각 보존합니다.</p>
        <div className="information-metric-grid"><div><span>사규예고</span><strong>{notices.length.toLocaleString("ko-KR")}건</strong></div><div><span>조직명 exact match</span><strong>{exactNotices.toLocaleString("ko-KR")}건</strong></div><div><span>잔차 occurrence</span><strong>{residualOccurrenceCount.toLocaleString("ko-KR")}건</strong></div><div><span>lexical label</span><strong>{residualLabelCount.toLocaleString("ko-KR")}개</strong></div></div>
        <p>잔차 관측, 문자열 라벨, 조직 후보와 귀속 근거를 서로 다른 계층으로 기록합니다. 이름 유사도나 후보 점수만으로 공식 조직을 확정하지 않으며, 조직개편이나 업무 이동을 연결하려면 공식 근거가 필요합니다.</p>
        <DiagramViewer />
        <p className="information-note">제공받은 ERD는 관계·필드명만 보여 줍니다. 공개 화면은 내부 실행 ID, 문서별 해시, 신뢰도 점수나 비마스킹 이름을 표시하지 않습니다. 상세 UI에서는 ‘상태’보다 ‘추론 근거’와 확인 경로를 먼저 읽습니다.</p>
      </InformationSection>
      <InformationSection number="05" title="자동 귀속의 검증 조건" id="method-stop">
        <p>자동 귀속 규칙은 정답을 알고 있는 데이터에서 보정한 뒤 독립 검증합니다. 정답을 누설할 수 있는 담당부서 원문이나 사람 이름은 입력에서 제외합니다.</p><p>표본 수, coverage, Top-1 정확도, Top-3 재현율, 모호성, 후보 없음 비중을 함께 봅니다. 사전에 정한 검증 조건을 충족하지 못하면 잔차 {residualOccurrenceCount.toLocaleString("ko-KR")}건에는 자동 귀속을 적용하지 않습니다. 하나의 신뢰도 점수로 이 차이를 합치지 않습니다.</p>
      </InformationSection>
      <InformationRelated links={[{ href: "/regulations", label: "규정 공개 현황" }, { href: "/residual-data", label: "담당 표기 잔차" }, { href: "/technical-specs", label: "기술 사양" }, { href: "/work-traces", label: "업무·근거 추적" }]} />
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
        <p>공개 규정·예고 데이터는 배포된 <code>public-snapshot-v2.json.gz</code>를 Next 서버에서 읽어 화면에 전달합니다. 규정 목록을 요청할 때마다 내부 원장이나 Supabase RPC를 조회하지 않습니다. 브라우저의 <code>/api/collection-state</code> 요청은 <b>수집 상태</b>만 표시하는 별도 경로입니다. PERSON 관측과 조직 attribution은 별도 공개 계약으로 분리되어 있습니다. 화면의 CSV 내려받기는 승인 데이터의 필터 결과를 만들며, 서버의 규정 전달 포맷이 아닙니다.</p>
        <p className="information-note">공개 규정 기준일 {release.evidence_as_of}, 별도 parser 원장 측정일 {parserMeasurements.measuredAt}과 공개본 생성일 {release.generated_at.slice(0, 10)}은 서로 다른 단계이며 같은 시점의 집계로 합산하지 않습니다. parser 원장 {parserMeasurements.ledger.parserRuns.toLocaleString("ko-KR")}회 실행 중 본문이 있는 occurrence {parserMeasurements.ledger.nonemptyOccurrences.toLocaleString("ko-KR")}건은 고유 추출 artifact {parserMeasurements.ledger.uniqueExtractions.toLocaleString("ko-KR")}건으로 보존됐습니다. 로그 출처: <code>{parserMeasurements.ledger.report}</code></p>
      </InformationSection>
      <InformationRelated links={[{ href: "/data-purpose", label: "데이터 수집 및 활용목적" }, { href: "/methodology", label: "검증 방법론" }, { href: "/regulations", label: "규정 공개 현황" }]} />
    </div></main>
  </>;
}
