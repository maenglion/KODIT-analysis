import { DepartmentStatistics } from "@kodit/common/regulations/DepartmentStatistics";
import { getPublishDataset } from "@/lib/review-data";
import technicalSpecs from "@/data/technical-specs.json";

const pendingLabels: Record<string, { title: string; reason: string }> = {
  "investment-statistics": { title: "투자·보증 통계", reason: "현재 공개 RPC에는 투자·보증 분류 근거가 포함되어 있지 않아 후속 공개 범위로 남겨둡니다." },
};
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "department-statistics") return <DepartmentStatisticsPage />;
  if (section === "technical-specs") return <TechnicalSpecs />;
  if (section === "data-purpose") return <InformationPage kind="purpose" />;
  if (section === "methodology") return <InformationPage kind="methodology" />;
  const content = pendingLabels[section] ?? { title: "페이지", reason: "현재 공개 데이터 계약으로 확인 가능한 내용만 순서대로 제공합니다." };
  return <main className="shell pending"><p className="eyebrow">후속 공개 범위</p><h1>{content.title}</h1><p>{content.reason}</p></main>;
}

const informationContent = {
  purpose: {
    eyebrow: "서비스 정보",
    title: "데이터 수집 및 활용목적",
    description: "흩어진 원문과 변경이력을 한곳에서 확인할 수 있도록 하여 국회, 연구자, 언론 및 시민이 공개·검증 상태와 근거를 직접 확인할 수 있게 합니다.",
    cards: [
      { title: "수집 및 활용 목적", sections: [
        ["사업환경 개선을 위한 공익적 목적", "공공기관에 흩어진 사규예고·규정·조직·사업자료를 연결·정리하여 필요한 사람이 공식 원문, 공개수준과 변경이력을 직접 확인할 수 있도록 제공합니다."],
        ["근거를 재현할 수 있는 공개", "결론만 표시하지 않고 확인 가능한 공식 게시물과 첨부자료를 연결합니다. 자동화가 확정할 수 없는 값은 임의로 채우지 않고 잔차로 보존합니다."],
      ]},
      { title: "개인정보 처리 및 비노출 원칙", sections: [
        ["필요한 범위에서만 처리", "공식 공개자료에 포함된 성명은 조직·직위·업무·변경이력의 동일성을 확인하는 데 필요한 범위에서만 처리합니다. 개인 평가·프로파일링 또는 사적 신상 공개를 목적으로 하지 않습니다."],
        ["불필요한 이름은 공개하지 않음", "조직 매칭을 위한 내부 관측값과 공개 화면을 분리합니다. 공개가 필요하지 않은 이름은 표시하지 않거나 마스킹하며 CSV에도 포함하지 않습니다."],
      ]},
      { title: "문의 및 정정 요청", sections: [["오류를 숨기지 않는 운영", "원문 변경, 링크 오류, 명칭 불일치 또는 개인정보 관련 요청을 확인해 다음 공개본에 반영합니다. 과거 공개본과 변경 근거는 삭제하지 않고 이력으로 관리합니다."]]},
    ],
  },
  methodology: {
    eyebrow: "검증 체계",
    title: "검증 방법론",
    description: "원본 파일, 추출 본문, 문자열 관측, 의미 판정과 공개 통계를 서로 다른 계층으로 관리합니다.",
    cards: [
      { title: "관측에서 분석까지", sections: [["계층 분리", "SOURCE → OBSERVATION → LABEL → ENTITY/NODE → RELATION → ANALYSIS 순서를 지키며, 앞 단계의 존재만으로 다음 단계의 의미를 자동 확정하지 않습니다."], ["잔차 처리", "현재 근거로 해소할 수 없는 담당 표기와 관계는 실패값으로 삭제하지 않고 release 단위 occurrence 원장에 남깁니다."]]},
      { title: "문서 무결성과 재현성", sections: [["세 가지 identity", "SHA-256은 같은 binary인지, extract_hash는 같은 추출 본문인지, extraction contract version은 어떤 규칙으로 본문을 만들었는지를 구분합니다."], ["덮어쓰지 않는 실행 이력", "parser 실행은 성공과 실패를 포함해 매번 보존하며 동일 결과는 extraction artifact를 재사용합니다."]]},
      { title: "자동화 중단 기준", sections: [["확정할 수 없으면 보류", "positive control과 독립 holdout이 정확도·표본수 기준을 충족하지 못하면 실제 잔차에 자동 적용하지 않습니다. 유사도만으로 조직이나 관계를 확정하지 않습니다."]]},
    ],
  },
} as const;

function InformationPage({ kind }: { kind: keyof typeof informationContent }) {
  const content = informationContent[kind];
  return <>
    <section className="methodology-hero"><div className="shell"><p>{content.eyebrow}</p><h1>{content.title}</h1><span>{content.description}</span><small>최근 수정일: 2026.09.19. · 최초 게시일: 2026.09.19.</small></div></section>
    <main className="methodology-page"><div className="shell">{content.cards.map((card) => <article className="methodology-card" key={card.title}><header><h2>{card.title}</h2><span>수정 내역(0)</span></header><div>{card.sections.map(([title, body]) => <section key={title}><h3>{title}</h3><p>{body}</p></section>)}</div></article>)}</div></main>
  </>;
}

function TechnicalSpecs() {
  return <main className="shell technical-page">
    <p className="eyebrow">기술 스펙</p><h1>공개·수집 시스템 구성</h1>
    <p className="statistics-note">저장소에 실제 canonical artifact가 존재하는 구성만 표시합니다. 아래 SHA-256은 각 파일의 실제 바이트를 기준으로 계산했습니다.</p>
    <div className="spec-grid">{technicalSpecs.map((spec) => <article className="spec-card" key={spec.name}>
      <div className="spec-head"><h2>{spec.name}</h2><span className={`spec-status ${spec.status}`}>{spec.status}</span></div>
      <p>{spec.role}</p>
      <dl><div><dt>버전</dt><dd>{spec.version}</dd></div><div><dt>최종 업데이트일</dt><dd>{spec.updatedAt}</dd></div><div><dt>제작</dt><dd>SoulSpectrum / Nanyoung Maeng</dd></div></dl>
      <div className="artifact-list">{spec.artifacts.map((artifact) => <div className="artifact" key={artifact.path}><b>Canonical artifact</b><code>{artifact.path}</code><b>Artifact SHA-256</b><code>{artifact.sha256}</code></div>)}</div>
    </article>)}</div>
  </main>;
}
async function DepartmentStatisticsPage() {
  const dataset = await getPublishDataset();
  if (!dataset.available) return <main className="shell connection-state"><p className="eyebrow">부서별 통계</p><h1>공개 데이터 연결 확인이 필요합니다</h1><p>측정되지 않은 값을 0건으로 표시하지 않습니다.</p></main>;
  return <DepartmentStatistics rows={dataset.rows} notices={dataset.notices} residuals={dataset.residuals} residualLabels={dataset.residualLabels} attributionExplanations={dataset.attributionExplanations} />;
}
