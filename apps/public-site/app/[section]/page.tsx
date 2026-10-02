import Link from "next/link";
import { notFound } from "next/navigation";
import { DepartmentStatistics } from "@kodit/common/regulations/DepartmentStatistics";
import { getPublishDataset } from "@/lib/review-data";
import technicalSpecs from "@/data/technical-specs.json";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "department-statistics") return <DepartmentStatisticsPage />;
  if (section === "technical-specs") return <TechnicalSpecs />;
  if (section === "data-purpose") return <InformationPage kind="purpose" />;
  if (section === "methodology") return <InformationPage kind="methodology" />;
  notFound();
}

const informationContent = {
  purpose: {
    eyebrow: "서비스 정보 / 01",
    title: "데이터 수집 및 활용목적",
    description: "공식 자료의 공개 여부와 변경 관계를, 원문과 재현 가능한 근거에 따라 누구나 확인할 수 있도록 정리합니다.",
    cards: [
      { title: "무엇을 모으고, 왜 연결하나요?", label: "수집 목적", sections: [
        ["공식 공개자료를 한곳에서 탐색", "신용보증기금의 공개 규정, 사규예고, 첨부파일 및 공식 설명을 규정 버전과 게시물 단위로 연결합니다. 개별 자료가 흩어져 있어도 제목·게시일·공식 출처를 통해 다시 확인할 수 있도록 하는 것이 목적입니다."],
        ["공개 현황의 해석 가능성", "자료가 공개됐는지와 현재 효력이 있는지는 서로 다른 질문입니다. 원문이 확인된 범위, 사규예고만 확인된 상태, 출처 확인이 필요한 상태를 구분해 표시하며 자료의 존재를 법적 확정으로 바꾸지 않습니다."],
      ] },
      { title: "자료가 화면에 이르는 과정", label: "처리 원칙", sections: [
        ["출처와 처리 이력을 분리", "공식 게시물과 파일을 수집하고, 추출된 본문과 출처·변환 이력을 별도로 보존합니다. 동일 파일의 확인, 문자열 관측, 규정·조직 관계의 해석은 각기 다른 단계에서 검토합니다."],
        ["확정되지 않은 값은 비워 둠", "자동 판정이 충분한 근거를 갖추지 못하면 임의의 부서·현행상태·관계를 채우지 않습니다. 미해결 표기는 잔차로 남기고, 이용자는 확인 가능한 범위와 한계를 함께 볼 수 있습니다."],
        ["승인된 정적 공개본", "이 사이트는 승인된 공개 snapshot을 사용합니다. 기준일과 생성일을 표시하며, DB 연결 상태나 실시간 변화를 최신값처럼 제시하지 않습니다. 별도 주제 분석은 그 자료의 기준일을 따로 밝힙니다."],
      ] },
      { title: "공개 범위와 이용 시 유의사항", label: "활용 경계", sections: [
        ["공익적 탐색과 검증", "연구·보도·시민의 정보 탐색을 위해 공개 자료의 위치와 확인 경로를 제공합니다. 화면의 분석 범주는 사람이나 기관에 대한 평가, 법적 판단, 특정 개인에 관한 결론을 뜻하지 않습니다."],
        ["최소한의 개인정보 노출", "공개 자료에 포함된 개인 표기는 필요한 해석 범위에서만 다루고, 공개 화면과 CSV에는 불필요한 이름이나 내부 검토 기록을 포함하지 않습니다. 마스킹된 값은 원문과 구별합니다."],
        ["오류의 수정과 추적", "출처 연결·명칭·날짜의 오류가 발견되면 검증한 근거와 함께 다음 공개본에 반영합니다. 미확정 정보를 사실로 조용히 덮어쓰지 않고 버전과 수정 이력을 분리합니다."],
      ] },
    ],
  },
  methodology: {
    eyebrow: "검증 체계 / 02",
    title: "검증 방법론",
    description: "원본 파일, 추출 본문, 문자열 관측, 의미 판정과 공개 통계를 서로 다른 계층에서 검토합니다.",
    cards: [
      { title: "관측에서 분석까지", label: "데이터 계층", sections: [
        ["단계별 근거", "SOURCE → OBSERVATION → LABEL → ENTITY/NODE → RELATION → ANALYSIS 순서를 지킵니다. 앞 단계의 존재만으로 다음 단계의 의미를 자동 확정하지 않습니다."],
        ["미해결 표기의 처리", "현재 근거로 해소할 수 없는 담당 표기와 관계는 실패값으로 삭제하지 않고 승인 공개본 단위의 잔차 원장에 남깁니다."],
      ] },
      { title: "문서 무결성과 재현성", label: "동일성", sections: [
        ["세 가지 구분", "SHA-256은 같은 바이너리인지, extract_hash는 같은 추출 본문인지, extraction contract version은 어떤 규칙으로 본문을 만들었는지를 구분합니다."],
        ["덮어쓰지 않는 실행 이력", "추출 실행은 성공과 실패를 포함해 보존하며, 동일한 결과에는 확인된 extraction artifact를 재사용합니다. 공식 출처와 파생 결과는 같은 종류의 근거로 세지 않습니다."],
      ] },
      { title: "자동화 중단 기준", label: "확정 제한", sections: [
        ["확정할 수 없으면 보류", "positive control과 독립 holdout이 정확도·표본수 기준을 충족하지 못하면 실제 잔차에 자동 적용하지 않습니다. 유사도만으로 조직이나 관계를 확정하지 않습니다."],
        ["주제 통계의 경계", "투자·보증 주제는 승인된 9개 하위군의 게시물을 중복 제거한 결과입니다. 보증·투자라는 단어가 등장한다는 이유만으로 포함하지 않으며, 통계마다 집계 단위와 기준일을 함께 제시합니다."],
      ] },
    ],
  },
} as const;

function InformationPage({ kind }: { kind: keyof typeof informationContent }) {
  const content = informationContent[kind];
  return <>
    <section className="methodology-hero"><div className="shell"><p>{content.eyebrow}</p><h1>{content.title}</h1><span>{content.description}</span><small>공개된 승인 자료와 저장소의 의미 계약을 기준으로 설명합니다.</small></div></section>
    <main className="methodology-page"><div className="shell">
      <div className="info-summary"><span>읽는 순서</span><p>공식 출처 확인 <b>→</b> 자료의 공개 범위 확인 <b>→</b> 미확정·잔차 확인. 원문 링크와 분석 결과는 같은 의미가 아닙니다.</p></div>
      {content.cards.map((card) => <article className="methodology-card" key={card.title}><header><h2>{card.title}</h2><span>{card.label}</span></header><div>{card.sections.map(([title, body]) => <section key={title}><h3>{title}</h3><p>{body}</p></section>)}</div></article>)}
      <div className="info-next"><div><h2>공개 자료 직접 확인하기</h2><p>본문 설명은 원문을 대체하지 않습니다. 승인본 목록과 설계 계약을 함께 읽어 주세요.</p></div><div><Link href="/regulations">규정 공개현황 보기 →</Link><a href="https://github.com/maenglion/KODIT-analysis/tree/main/docs/architecture" target="_blank" rel="noopener noreferrer">공개 설계 문서 ↗</a></div></div>
    </div></main>
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
  return <DepartmentStatistics rows={dataset.rows} notices={dataset.notices} residuals={dataset.residuals} residualLabels={dataset.residualLabels} attributionExplanations={dataset.attributionExplanations} />;
}
