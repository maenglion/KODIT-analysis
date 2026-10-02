export type TopicNoticeFilter = { family: string; year?: string; query: string };

type SearchableTopicNotice = { title: string; date: string; families: readonly string[] };
type ExportableTopicNotice = SearchableTopicNotice & { number: string | number; evidence: readonly string[]; sourceUrl?: string | null };

export function filterTopicNotices<T extends SearchableTopicNotice>(notices: readonly T[], filter: TopicNoticeFilter, familyNames: ReadonlyMap<string, string>): T[] {
  const term = filter.query.trim().toLocaleLowerCase("ko-KR");
  return notices.filter((notice) => {
    const matchesFamily = filter.family === "ALL" || notice.families.includes(filter.family);
    const matchesYear = !filter.year || notice.date.startsWith(filter.year);
    const searchText = `${notice.title} ${notice.families.map((code) => familyNames.get(code) ?? "").join(" ")}`.toLocaleLowerCase("ko-KR");
    return matchesFamily && matchesYear && (!term || searchText.includes(term));
  });
}

export function topicEvidenceUrl({ family = "ALL", year = "" }: { family?: string; year?: string } = {}): string {
  const params = new URLSearchParams();
  if (family !== "ALL") params.set("family", family);
  if (year) params.set("year", year);
  const query = params.toString();
  return `/investment-statistics/evidence-notices${query ? `?${query}` : ""}`;
}

export function topicNoticesToCsv<T extends ExportableTopicNotice>(notices: readonly T[], familyNames: ReadonlyMap<string, string>): string {
  const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const columns = ["게시번호", "제목", "게시일", "승인된 하위군", "분류 근거", "공식 게시판 URL"];
  const body = notices.map((notice) => [notice.number, notice.title, notice.date, notice.families.map((code) => familyNames.get(code) ?? code).join("; "), notice.evidence.join("; "), notice.sourceUrl ?? ""]);
  return `\uFEFF${[columns, ...body].map((record) => record.map(quote).join(",")).join("\r\n")}\r\n`;
}
