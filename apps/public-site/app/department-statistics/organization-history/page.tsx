import type { Metadata } from "next";
import { OrganizationHistory } from "@kodit/common/regulations/OrganizationHistory";
import { organizationSnapshot } from "@kodit/common/regulations";
import { CollectionStatus } from "@/components/CollectionStatus";
import history from "@/data/organization-public-history-v1.json";

export const metadata: Metadata = {
  title: "조직 히스토리 | KODIT 부서별 통계",
  description: "공식 근거로 확인된 개인정보보호 기능의 연도별 이관 경로와 조직 관련 사규예고·시행 문서를 구분해 살펴봅니다.",
};

export default function OrganizationHistoryPage() {
  return <>
    <section className="public-page-intro department-intro"><div className="shell intro-inner intro-inner-with-status"><div className="intro-copy">
      <p className="breadcrumb"><a href="/regulations">규정·법령</a> &gt; <a href="/department-statistics">부서별 통계</a> &gt; <b>조직 히스토리</b></p>
      <h1>조직 히스토리</h1>
      <p>연도를 선택하면 공식 근거가 확인된 개인정보보호 담당 기능의 이관 경로를 보여줍니다. 조직 전체의 승계나 신설과는 구분합니다.</p>
    </div><CollectionStatus evidenceAsOf={organizationSnapshot.snapshotDate} basisLabel="조직도" additionalBases={[{ label: "사규예고", date: history.noticeEvidenceAsOf }, { label: "시행문서", date: history.enactedEvidenceAsOf.slice(0, 10) }]} /></div></section>
    <main className="department-page department-standalone"><div className="shell">
      <OrganizationHistory history={history} />
      <nav className="purpose-related" aria-label="관련 페이지"><h2>관련 페이지</h2><ul><li><a href="/department-statistics">부서별 통계 요약</a></li><li><a href="/department-statistics/semantic-matching">시맨틱 매칭방식</a></li><li><a href="/residual-data">담당 표기 잔차</a></li></ul></nav>
    </div></main>
  </>;
}
