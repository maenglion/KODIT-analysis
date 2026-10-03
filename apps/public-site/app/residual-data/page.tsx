import type { Metadata } from "next";
import { DepartmentResidualAnalysis } from "@kodit/common/regulations/DepartmentResidualAnalysis";
import { organizationSnapshot } from "@kodit/common/regulations";
import { CollectionStatus } from "@/components/CollectionStatus";
import { getPublishDataset } from "@/lib/review-data";

export const metadata: Metadata = {
  title: "담당 표기 잔차 데이터 | KODIT",
  description: "공식 조직명과 일치하지 않은 사규예고 담당 표기 및 근거 기반 분류를 살펴봅니다.",
};

export default async function ResidualDataPage() {
  const dataset = await getPublishDataset();
  // PERSON은 다른 문서 본문의 인물형 문자열 관측일 뿐 소속 추론이 아니다.
  // 사용하지 않는 조직 후보 설명은 정적 페이지의 클라이언트 props에도 전달하지 않는다.
  const nonPersonResidualIds = new Set(dataset.residuals.filter(row => row.resolution_class !== "PERSON_EVIDENCE").map(row => row.residual_id));
  const publicAttributions = dataset.attributionExplanations.filter(row => nonPersonResidualIds.has(row.residual_id));
  return <>
    <section className="public-page-intro"><div className="shell intro-inner intro-inner-with-status"><div className="intro-copy"><p className="breadcrumb"><a href="/regulations">규정·법령</a> &gt; <b>잔차 데이터</b></p><h1>담당 표기 잔차 데이터</h1><p>기준 조직명과 직접 일치하지 않은 사규예고 담당 표기의 관측·라벨·공식 근거를 각각 구분해 보여줍니다.</p></div><CollectionStatus evidenceAsOf={dataset.release.evidence_as_of} basisLabel="사규예고" additionalBases={[{ label: "조직도", date: organizationSnapshot.snapshotDate }]} snapshotGeneratedAt={dataset.release.generated_at} generationSource="규정 공개본" /></div></section>
    <main className="residual-data-page"><div className="shell" id="residual-index"><aside className="public-notice"><img src="/figma-icons/info.svg" alt=""/><div><b>담당 표기 잔차의 발생과 처리 과정을 공개합니다</b><p>사규예고의 담당 표기가 기준 조직명과 직접 일치하지 않아 관측 잔차로 남았습니다. 표기를 라벨로 분류하고 공식 조직 근거·업무 경로를 평가한 뒤, 확인된 연결과 미확정 항목을 구분해 보존합니다. <a href="/methodology#residual-ledger-erd">잔차 처리 원장 ERD 보기 ↗</a></p></div></aside><DepartmentResidualAnalysis occurrences={dataset.residuals} summary={dataset.residualLabels} attributions={publicAttributions} /></div></main>
  </>;
}
