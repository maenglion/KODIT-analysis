import { getWorkTraceDataset } from "@/lib/work-trace-data";
import { backlogCsv, branchesCsv, endpointsCsv } from "@/lib/work-trace-csv";
import { axisRows, entryKey, selectedBranches, traceAxis, traceQuery } from "@/lib/work-trace-view";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("type");
  if (kind !== "branches" && kind !== "endpoints" && kind !== "backlog") {
    return new Response("지원하지 않는 CSV 종류입니다.", { status: 400 });
  }

  const snapshot = await getWorkTraceDataset();
  const axis = traceAxis(params.get("axis") ?? "");
  const query = traceQuery(params.get("q") ?? "");
  const rows = axisRows(snapshot, axis, query);
  const requestedEntry = params.get("entry");
  const selectedEntry = requestedEntry ? rows.find((row) => entryKey(row) === requestedEntry) ?? null : null;
  if (requestedEntry && !selectedEntry && kind !== "backlog") {
    return new Response("선택한 탐색 항목을 공개본에서 찾을 수 없습니다.", { status: 404 });
  }

  // The research backlog has its own grain. Axis search never changes its approved impact counts.
  const branches = kind === "backlog" ? [] : selectedBranches(snapshot, rows, selectedEntry);
  const organizationKeys = axis === "current_organizations"
    ? new Set((selectedEntry ? [selectedEntry] : rows)
      .filter((row): row is typeof snapshot.axes.current_organizations[number] => "current_org_key" in row)
      .map((row) => row.current_org_key))
    : undefined;
  const body = kind === "branches" ? branchesCsv(branches)
    : kind === "endpoints" ? endpointsCsv(branches, organizationKeys)
    : backlogCsv(snapshot.research_backlog, snapshot.branches);
  const filename = `work-trace-${kind}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
