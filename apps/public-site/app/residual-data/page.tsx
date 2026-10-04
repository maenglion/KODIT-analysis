import type { Metadata } from "next";
import { DepartmentResidualAnalysis } from "@kodit/common/regulations/DepartmentResidualAnalysis";
import { organizationSnapshot } from "@kodit/common/regulations";
import { PersonResidualObservations } from "@kodit/common/regulations/PersonResidualObservations";
import { CollectionStatus } from "@/components/CollectionStatus";
import { getPublishDataset } from "@/lib/review-data";
import { getWorkTraceDataset } from "@/lib/work-trace-data";

export const metadata: Metadata = {
  title: "담당 표기 잔차 데이터 | KODIT",
  description: "공식 조직명과 일치하지 않은 사규예고 담당 표기 및 근거 기반 분류를 살펴봅니다.",
};

export default async function ResidualDataPage() {
  const [dataset, trace] = await Promise.all([getPublishDataset(), getWorkTraceDataset()]);
  const outcomes = trace.summary.terminal_outcomes;

  return <>
    <section className="public-page-intro">
      <div className="shell intro-inner intro-inner-with-status">
        <div className="intro-copy">
          <p className="breadcrumb"><a href="/regulations">규정·법령</a> &gt; <b>잔차 데이터</b></p>
          <h1>담당 표기 잔차 데이터</h1>
          <p>기준 조직명과 직접 일치하지 않은 사규예고 담당 표기의 관측·라벨·공식 근거를 각각 구분해 보여줍니다.</p>
        </div>
        <CollectionStatus evidenceAsOf={dataset.release.evidence_as_of} basisLabel="사규예고" additionalBases={[{ label: "조직도", date: organizationSnapshot.snapshotDate }]} snapshotGeneratedAt={dataset.release.generated_at} generationSource="규정 공개본" />
      </div>
    </section>
    <main className="residual-data-page">
      <div className="shell" id="residual-index">
        <aside className="public-notice"><img src="/figma-icons/info.svg" alt=""/><div>
          <b>담당 표기 잔차의 발생과 처리 과정을 공개합니다</b>
          <p>사규예고의 담당 표기가 기준 조직명과 직접 일치하지 않아 관측 잔차로 남았습니다. 사람형 표기는 승인된 별칭과 관측 게시물만 공개하며 조직 후보·업무귀속·이동 경로·추론 과정과 결합하지 않습니다. <a href="/methodology#residual-ledger-erd">잔차·라벨·귀속 원장 보기 ↗</a> · <a href="/work-traces">사규예고별 업무 추적 보기 ↗</a></p>
        </div></aside>
        <aside className="residual-trace-teaser" aria-labelledby="residual-trace-title">
          <div>
            <p className="eyebrow">별도 업무 추적 공개본 · 근거 기준일 {trace.evidence_as_of}</p>
            <h2 id="residual-trace-title">사규예고에서 시작한 업무 근거, 어디까지 이어졌나</h2>
            <p>사규예고 {trace.summary.notice_count.toLocaleString("ko-KR")}건에서 시작한 추적 분기 {trace.summary.branch_count.toLocaleString("ko-KR")}건의 종결값입니다.</p>
            <dl>
              <div><dt>현행 업무분장까지 직접 확인</dt><dd>{outcomes.COMPLETE.toLocaleString("ko-KR")}건</dd></div>
              <div><dt>복수 문구 후보</dt><dd>{outcomes.FUNCTION_MULTIPLE_CANDIDATES.toLocaleString("ko-KR")}건</dd></div>
              <div><dt>현행 대응 미확인</dt><dd>{outcomes.FUNCTION_CORRESPONDENCE_UNCONFIRMED.toLocaleString("ko-KR")}건</dd></div>
              <div><dt>규정 연결 근거 부재</dt><dd>{outcomes.RELATION_EVIDENCE_GAP.toLocaleString("ko-KR")}건</dd></div>
            </dl>
            <small>담당 표기·PERSON 별칭에서 현행 조직을 추정한 결과가 아닙니다. 현행 업무 관측과 공식 이관 경로도 구별합니다.</small>
          </div>
          <a href="/work-traces">증거사슬에서 근거 보기 <span aria-hidden="true">→</span></a>
        </aside>
        <PersonResidualObservations rows={dataset.personResidualObservations} />
        <DepartmentResidualAnalysis occurrences={dataset.residuals} summary={dataset.residualLabels} attributions={dataset.organizationAttributionExplanations} />
      </div>
    </main>
  </>;
}
