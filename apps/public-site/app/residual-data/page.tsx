import type { Metadata } from "next";
import { DepartmentResidualAnalysis } from "@kodit/common/regulations/DepartmentResidualAnalysis";
import { getPublishDataset } from "@/lib/review-data";

export const metadata: Metadata = {
  title: "담당 표기 잔차 데이터 | KODIT",
  description: "공식 조직명과 일치하지 않은 사규예고 담당 표기 및 근거 기반 분류를 살펴봅니다.",
};

export default async function ResidualDataPage() {
  const dataset = await getPublishDataset();
  return <>
    <section className="public-page-intro"><div className="shell intro-inner"><div className="intro-copy"><p className="breadcrumb"><a href="/regulations">규정·법령</a> &gt; <b>잔차 데이터</b></p><h1>담당 표기 잔차 데이터</h1><p>기준 조직명과 직접 일치하지 않은 사규예고 담당 표기의 관측·라벨·공식 근거를 각각 구분해 보여줍니다.</p></div><div className="database-state"><b>승인된 정적 공개본</b><span>근거 기준 {dataset.release.evidence_as_of}</span></div></div></section>
    <main className="residual-data-page"><div className="shell" id="residual-index"><aside className="public-notice"><img src="/figma-icons/info.svg" alt=""/><div><b>잔차는 버릴 데이터가 아닙니다</b><p>‘인물형 근거 있음’은 실제 인물 신원·소속 확정이 아닙니다. 조직 변경 후보와 공식 확인된 기능 이관도 분리해 해석합니다. <a href="/department-statistics#organization-history">확인된 기능 이동 보기 ↗</a></p></div></aside><DepartmentResidualAnalysis occurrences={dataset.residuals} summary={dataset.residualLabels} attributions={dataset.attributionExplanations} /></div></main>
  </>;
}
