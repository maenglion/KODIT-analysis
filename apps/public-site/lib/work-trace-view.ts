import type {
  PublicWorkTraceBranch,
  PublicWorkTraceNoticeAxisRow,
  PublicWorkTraceOrganizationAxisRow,
  PublicWorkTraceRegulationAxisRow,
  PublicWorkTraceSnapshot,
} from "@kodit/common/regulations/work-trace-contract";

export type WorkTraceAxis = "notices" | "regulations" | "current_organizations";
export type WorkTraceAxisRow =
  | PublicWorkTraceNoticeAxisRow
  | PublicWorkTraceRegulationAxisRow
  | PublicWorkTraceOrganizationAxisRow;
export type WorkTraceAxisViewRow =
  | Omit<PublicWorkTraceNoticeAxisRow, "public_branch_keys">
  | Omit<PublicWorkTraceRegulationAxisRow, "public_branch_keys">
  | Omit<PublicWorkTraceOrganizationAxisRow, "public_branch_keys">;

export const TRACE_LIST_SIZE = 12;
export const TRACE_BRANCH_SIZE = 8;
export const TRACE_BACKLOG_SIZE = 10;

export function first(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

export function traceAxis(value: string): WorkTraceAxis {
  return value === "regulations" || value === "current_organizations" ? value : "notices";
}

export function traceQuery(value: string): string {
  return value.trim().slice(0, 80);
}

export function tracePage(value: string): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10000) : 1;
}

function searchable(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR");
}

export function axisRows(snapshot: PublicWorkTraceSnapshot, axis: WorkTraceAxis, query: string): WorkTraceAxisRow[] {
  const rows: WorkTraceAxisRow[] = snapshot.axes[axis];
  const terms = searchable(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return rows;
  return rows.filter((row) => {
    const label = "current_org_name" in row ? row.current_org_name : row.title;
    const date = "posted_at" in row ? row.posted_at : "";
    const text = searchable(`${label} ${date}`);
    return terms.every((term) => text.includes(term));
  });
}

export function entryKey(row: WorkTraceAxisRow | WorkTraceAxisViewRow): string {
  if ("public_notice_key" in row) return row.public_notice_key;
  if ("public_regulation_key" in row) return row.public_regulation_key;
  return row.current_org_key;
}

export function selectedBranches(
  snapshot: PublicWorkTraceSnapshot,
  rows: WorkTraceAxisRow[],
  selectedEntry: WorkTraceAxisRow | null,
): PublicWorkTraceBranch[] {
  const keys = new Set((selectedEntry ? [selectedEntry] : rows).flatMap((row) => row.public_branch_keys));
  return snapshot.branches.filter((branch) => keys.has(branch.public_branch_key));
}

export function officialSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function outcomeText(branch: PublicWorkTraceBranch): string {
  return branch.terminal_outcome === "COMPLETE"
    ? branch.completion_scope_label ?? "확인된 범위까지 추적 완료"
    : branch.terminal_outcome_label;
}

export function traceHref(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return `/work-traces${query.size ? `?${query.toString()}` : ""}`;
}
