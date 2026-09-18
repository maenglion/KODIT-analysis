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
  const content = pendingLabels[section] ?? { title: "페이지", reason: "현재 공개 데이터 계약으로 확인 가능한 내용만 순서대로 제공합니다." };
  return <main className="shell pending"><p className="eyebrow">후속 공개 범위</p><h1>{content.title}</h1><p>{content.reason}</p></main>;
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
  return <DepartmentStatistics rows={dataset.rows} notices={dataset.notices} residuals={dataset.residuals} residualLabels={dataset.residualLabels} />;
}
