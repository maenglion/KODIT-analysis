import type { Metadata } from "next";
import type { PublicWorkTraceSnapshot } from "@kodit/common/regulations/work-trace-contract";
import { WorkTraceExplorer } from "@/components/WorkTraceExplorer";
import { getWorkTraceDataset } from "@/lib/work-trace-data";
import {
  TRACE_BACKLOG_SIZE, TRACE_BRANCH_SIZE, TRACE_LIST_SIZE,
  axisRows, entryKey, first, outcomeText, selectedBranches, traceAxis, tracePage, traceQuery,
} from "@/lib/work-trace-view";

export const metadata: Metadata = {
  title: "업무 이동 근거 추적 | KODIT",
  description: "사규예고의 개정 대상 규정과 업무를 공식 자료로 확인한 단계, 중단 지점과 근거를 살펴봅니다.",
};

type Query = Record<string, string | string[] | undefined>;

type BranchChoice = {
  key: string;
  noticeTitle: string;
  postedAt: string;
  regulationTitle: string | null;
  outcome: string;
  endpointCount: number;
};

export default async function WorkTracesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [snapshot, values] = await Promise.all([getWorkTraceDataset(), searchParams]);
  const axis = traceAxis(first(values.axis));
  const query = traceQuery(first(values.q));
  const rows = axisRows(snapshot, axis, query);
  const rowPage = Math.min(tracePage(first(values.page)), Math.max(1, Math.ceil(rows.length / TRACE_LIST_SIZE)));
  const entry = rows.find((row) => entryKey(row) === first(values.entry)) ?? null;
  const branches = entry ? selectedBranches(snapshot, rows, entry) : [];
  const branchPage = Math.min(tracePage(first(values.branchPage)), Math.max(1, Math.ceil(branches.length / TRACE_BRANCH_SIZE)));
  const branchChoice = branches.find((row) => row.public_branch_key === first(values.branch))
    ?? (branches.length === 1 ? branches[0] : null);
  const currentBacklogPage = Math.min(tracePage(first(values.needPage)), Math.max(1, Math.ceil(snapshot.research_backlog.length / TRACE_BACKLOG_SIZE)));
  const backlog = snapshot.research_backlog.slice((currentBacklogPage - 1) * TRACE_BACKLOG_SIZE, currentBacklogPage * TRACE_BACKLOG_SIZE);
  const visibleRows = rows.slice((rowPage - 1) * TRACE_LIST_SIZE, rowPage * TRACE_LIST_SIZE)
    .map(({ public_branch_keys: _keys, ...display }) => display);
  const visibleEntry = entry ? (({ public_branch_keys: _keys, ...display }) => display)(entry) : null;
  const visibleBacklog = backlog.map(({ public_branch_keys: _keys, ...display }) => display);

  const neededEvidence = new Set<string>();
  for (const step of branchChoice?.steps ?? []) for (const no of step.evidence_numbers) neededEvidence.add(no);
  for (const endpoint of branchChoice?.current_endpoints ?? []) for (const no of endpoint.evidence_numbers) neededEvidence.add(no);
  for (const item of backlog) for (const no of item.last_evidence_numbers) neededEvidence.add(no);
  const evidence = snapshot.evidence.filter((item) => neededEvidence.has(item.evidence_no));

  const branchChoices: BranchChoice[] = branches
    .slice((branchPage - 1) * TRACE_BRANCH_SIZE, branchPage * TRACE_BRANCH_SIZE)
    .map((branch) => ({
      key: branch.public_branch_key,
      noticeTitle: branch.notice.title,
      postedAt: branch.notice.posted_at,
      regulationTitle: branch.regulation?.title ?? null,
      outcome: outcomeText(branch),
      endpointCount: branch.current_endpoint_count,
    }));

  return <>
    <section className="public-page-intro">
      <div className="shell intro-inner intro-inner-with-status">
        <div className="intro-copy">
          <p className="breadcrumb"><a href="/residual-data">잔차 데이터</a> &gt; <b>업무 추적</b></p>
          <h1>업무 이동 근거 추적</h1>
          <p>사규예고가 다룬 규정과 업무를 공식 문서에 따라 시간순으로 확인합니다. 확인된 자료가 이어지는 지점까지만 표시하며, 다음 관계를 확인할 수 없는 구간은 연결하지 않습니다. 각 단계의 근거문서와 추적이 멈춘 이유를 함께 제공합니다.</p>
        </div>
        <aside className="work-trace-release" aria-label="업무 추적 공개본 기준">
          <dl><div><dt>공개 데이터 기준일</dt><dd>{snapshot.evidence_as_of} · 업무 추적</dd></div>
            <div><dt>공개본 생성 시각</dt><dd>{formatPublishedAt(snapshot.projected_at)}</dd></div>
            <div><dt>근거 자료</dt><dd>검증된 정적 추적 공개본</dd></div></dl>
          <p>자동수집 상태와 별개로 승인된 근거 범위입니다.</p>
        </aside>
      </div>
    </section>
    <main className="work-trace-page">
      <WorkTraceExplorer
        summary={snapshot.summary}
        dataLiteracy={snapshot.data_literacy}
        axis={axis}
        query={query}
        rows={visibleRows}
        rowCount={rows.length}
        rowPage={rowPage}
        entry={visibleEntry}
        branchChoices={branchChoices}
        branchCount={branches.length}
        branchPage={branchPage}
        branch={branchChoice}
        evidence={evidence}
        backlog={visibleBacklog}
        backlogCount={snapshot.research_backlog.length}
        backlogPage={currentBacklogPage}
        comparisons={snapshot.run_comparisons}
        parentRunKey={snapshot.parent_public_run_key}
      />
    </main>
  </>;
}

function formatPublishedAt(value: PublicWorkTraceSnapshot["projected_at"]): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "기록 없음" : new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}
