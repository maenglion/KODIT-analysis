import type { PublicWorkTraceBranch, PublicWorkTraceResearchBacklogRow } from "@kodit/common/regulations/work-trace-contract";

export type BacklogKind = "RELATION_EVIDENCE_GAP" | "FUNCTION_CORRESPONDENCE_UNCONFIRMED";
export type WorkTraceBacklogViewRow = Omit<PublicWorkTraceResearchBacklogRow, "public_branch_keys"> & { targetTitle: string };
export type WorkTraceBacklogSection = {
  kind: BacklogKind;
  count: number;
  page: number;
  rows: WorkTraceBacklogViewRow[];
};

/** The snapshot's public branch references are the only basis for this target title. */
export function backlogTargetTitle(
  item: PublicWorkTraceResearchBacklogRow,
  branches: ReadonlyMap<string, PublicWorkTraceBranch>,
): string {
  const titles = new Set(item.public_branch_keys.map((key) => {
    const branch = branches.get(key);
    return item.need_kind === "RELATION_EVIDENCE_GAP" ? branch?.notice.title : branch?.regulation?.title;
  }));
  return titles.size === 1 && !titles.has(undefined) ? [...titles][0]! : "대상 제목 대조 미확인";
}

export function visibleBacklogSection(
  rows: PublicWorkTraceResearchBacklogRow[], kind: BacklogKind, page: number,
  size: number, branches: ReadonlyMap<string, PublicWorkTraceBranch>,
): WorkTraceBacklogSection {
  const group = rows.filter((item) => item.need_kind === kind);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(group.length / size)));
  const visible = group.slice((currentPage - 1) * size, currentPage * size).map((item) => {
    const { public_branch_keys: _keys, ...display } = item;
    return { ...display, targetTitle: backlogTargetTitle(item, branches) };
  });
  return { kind, count: group.length, page: currentPage, rows: visible };
}
