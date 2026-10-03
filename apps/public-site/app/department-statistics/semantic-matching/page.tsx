import type { Metadata } from "next";
import { DepartmentEvidenceGuide } from "@kodit/common/regulations/DepartmentEvidenceGuide";
import { organizationSnapshot, type Availability } from "@kodit/common/regulations";
import { CollectionStatus } from "@/components/CollectionStatus";
import { getPublishDataset } from "@/lib/review-data";

export const metadata: Metadata = {
  title: "시맨틱 매칭방식 | KODIT 부서별 통계",
  description: "파일 추출, 규정 버전의 공개 상태, 담당 표기와 조직 근거의 판정을 분리해 설명합니다.",
};

export default async function SemanticMatchingPage() {
  const dataset = await getPublishDataset();
  const availability: Record<Availability, number> = {
    FULLTEXT_PUBLIC: 0,
    PARTIAL_PUBLIC: 0,
    NOTICE_ONLY: 0,
    SOURCE_UNKNOWN: 0,
  };
  for (const row of dataset.rows) availability[row.availability] += 1;

  return <>
    <section className="public-page-intro department-intro"><div className="shell intro-inner intro-inner-with-status"><div className="intro-copy">
      <p className="breadcrumb"><a href="/regulations">규정·법령</a> &gt; <a href="/department-statistics">부서별 통계</a> &gt; <b>시맨틱 매칭방식</b></p>
      <h1>시맨틱 매칭방식</h1>
      <p>공식 자료의 본문 확보와 담당 표기의 조직 해석은 다른 검증입니다. 파일의 기술 결과를 조직의 정체성이나 규정 전문 공개로 바로 바꾸지 않습니다.</p>
    </div><CollectionStatus evidenceAsOf={dataset.release.evidence_as_of} basisLabel="규정·예고" additionalBases={[{ label: "조직도", date: organizationSnapshot.snapshotDate }]} snapshotGeneratedAt={dataset.release.generated_at} generationSource="규정 공개본" /></div></section>
    <main className="department-page department-standalone"><div className="shell">
      <aside className="public-notice"><img src="/figma-icons/info.svg" alt="" /><div><b>근거와 판정을 단계별로 분리합니다</b><p>출처·파일·규정 버전·담당 표기·공식 조직 관계를 각각 확인합니다. 서로 다른 승인 시점의 지표와 파일 실패를 하나의 점수로 합치지 않습니다.</p></div></aside>
      <DepartmentEvidenceGuide scope="전체 승인 공개본" availability={availability} />
      <nav className="purpose-related" aria-label="관련 페이지"><h2>관련 페이지</h2><ul><li><a href="/department-statistics">부서별 통계 요약</a></li><li><a href="/methodology#residual-ledger-erd">잔차 처리 원장 ERD</a></li><li><a href="/department-statistics/organization-history">조직 히스토리</a></li></ul></nav>
    </div></main>
  </>;
}
