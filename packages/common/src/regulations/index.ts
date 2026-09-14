export type Availability = "FULLTEXT_PUBLIC" | "PARTIAL_PUBLIC" | "NOTICE_ONLY" | "SOURCE_UNKNOWN";

export type PublishRegulationRow = {
  release_id: string; regulation_version_id: string; regulation_code: string; display_name: string; normalized_name: string;
  availability: Availability; currentness: string; revision_date: string | null; notice_department: string | null;
  official_source_available: boolean; source_location: string | null; partial_alio: boolean; partial_kodit_page: boolean;
  partial_attachment: boolean; is_new: boolean; is_updated: boolean;
};
export type PublishNoticeRow = { release_id: string; notice_number: string; title: string; notice_department: string | null; posted_date: string; source_location: string; linked_regulation_version_ids: string[] };
export type PublicRegulationSourceRow = { release_id: string; regulation_version_id: string; regulation_code: string; source_kind: string; evidence_role: string; source_location: string | null; attachment_name: string | null };
export type PublishReleaseMetadata = { release_id: string; release_type: string; schema_version: string; evidence_as_of: string; generated_at: string; source_snapshot_hash: string; projection_hash: string; population: number };
export type PublicRegulationFilters = { query: string; availability: Availability | "ALL"; currentness: string; partialType: "ALL" | "ALIO" | "KODIT_PAGE" | "ATTACHMENT" };
export type RegulationSort = "REVISION_DESC" | "NAME_ASC" | "NOTICE_DESC";
export type NoticeFilters = { query: string; startDate: string; endDate: string; year: string; department: string; unmappedOnly: boolean };

export const availabilityOrder: Availability[] = ["FULLTEXT_PUBLIC", "PARTIAL_PUBLIC", "NOTICE_ONLY", "SOURCE_UNKNOWN"];
export const availabilityLabels: Record<Availability, string> = { FULLTEXT_PUBLIC: "전문 공개", PARTIAL_PUBLIC: "일부 공개", NOTICE_ONLY: "사전예고만", SOURCE_UNKNOWN: "출처불명" };
export const currentnessLabels: Record<string, string> = { current: "현행 확인", past: "과거", abolished: "폐지", merged: "통합", unknown: "미확인" };

export const organizationSnapshot = {
  snapshotDate: "2026-09-15",
  sourceUrl: "https://www.kodit.or.kr/kodit/cm/cntnts/cntntsView.do?cntntsId=11149&mi=2456",
  sourceName: "신용보증기금 조직 안내",
  hierarchy: [
    { division: "경영기획부문", units: ["경영기획부", "성과관리부", "ICT전략부"] },
    { division: "신용사업부문", units: ["신용보증부", "자본시장부", "4.0창업부", "플랫폼금융부", "빅데이터부"] },
    { division: "전략사업부문", units: ["신용보험부", "기업개선부", "인프라금융부"] },
    { division: "경영지원부문", units: ["인재경영부", "업무지원부", "고객지원부", "안전관리관"] },
    { division: "독립부서", units: ["감사실", "미래전략실", "리스크준법실", "홍보실", "비서실"] },
  ],
} as const;
const canonicalDepartments = new Set<string>(organizationSnapshot.hierarchy.flatMap((item) => item.units));
export function canonicalDepartment(value: string | null | undefined) { const exact = value?.trim(); return exact && canonicalDepartments.has(exact) ? exact : null; }

export function validPublicUrl(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" ? url.href : null; } catch { return null; }
}
export function normalizePublicSearch(value: string) { return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim(); }
function tokensMatch(query: string, values: Array<string | null | undefined>) {
  const tokens = normalizePublicSearch(query).split(" ").filter(Boolean); if (!tokens.length) return true;
  const haystack = normalizePublicSearch(values.filter(Boolean).join(" ")); return tokens.every((token) => haystack.includes(token));
}
export function latestNoticeDates(notices: PublishNoticeRow[]) {
  const dates = new Map<string, string>();
  for (const notice of notices) for (const id of notice.linked_regulation_version_ids) if (!dates.get(id) || dates.get(id)! < notice.posted_date) dates.set(id, notice.posted_date);
  return dates;
}
export function filterPublishRegulations(rows: PublishRegulationRow[], filters: PublicRegulationFilters) {
  return rows.filter((row) => {
    if (!tokensMatch(filters.query, [row.display_name, row.normalized_name, row.notice_department, row.revision_date?.slice(0, 4)])) return false;
    if (filters.availability !== "ALL" && row.availability !== filters.availability) return false;
    if (filters.currentness && row.currentness !== filters.currentness) return false;
    if (filters.partialType === "ALIO" && !row.partial_alio) return false;
    if (filters.partialType === "KODIT_PAGE" && !row.partial_kodit_page) return false;
    if (filters.partialType === "ATTACHMENT" && !row.partial_attachment) return false;
    return true;
  });
}
export function sortPublishRegulations(rows: PublishRegulationRow[], sort: RegulationSort, noticeDates: Map<string, string>) {
  const dateDesc = (a: string | null | undefined, b: string | null | undefined) => a === b ? 0 : !a ? 1 : !b ? -1 : b.localeCompare(a);
  return [...rows].sort((a, b) => sort === "NAME_ASC" ? a.display_name.localeCompare(b.display_name, "ko") : sort === "NOTICE_DESC" ? dateDesc(noticeDates.get(a.regulation_version_id), noticeDates.get(b.regulation_version_id)) || a.display_name.localeCompare(b.display_name, "ko") : dateDesc(a.revision_date, b.revision_date) || dateDesc(noticeDates.get(a.regulation_version_id), noticeDates.get(b.regulation_version_id)) || a.display_name.localeCompare(b.display_name, "ko"));
}
export function filterAndSortNotices(rows: PublishNoticeRow[], filters: NoticeFilters) {
  return rows.filter((row) => {
    if (!tokensMatch(filters.query, [row.title, row.notice_department, row.posted_date])) return false;
    if (filters.startDate && row.posted_date < filters.startDate) return false; if (filters.endDate && row.posted_date > filters.endDate) return false;
    if (filters.year && !row.posted_date.startsWith(filters.year)) return false; if (filters.department && row.notice_department !== filters.department) return false;
    if (filters.unmappedOnly && canonicalDepartment(row.notice_department)) return false; return true;
  }).sort((a, b) => b.posted_date.localeCompare(a.posted_date) || b.notice_number.localeCompare(a.notice_number, "ko", { numeric: true }));
}
const csvCell = (value: unknown) => { const text = String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const makeCsv = (columns: string[], values: unknown[][]) => "\uFEFF" + [columns.join(","), ...values.map((row) => row.map(csvCell).join(","))].join("\r\n") + "\r\n";
export function publishRowsToCsv(rows: PublishRegulationRow[], release?: PublishReleaseMetadata, noticeDates = new Map<string, string>()) {
  return makeCsv(["row_number", "regulation_code", "regulation_name", "availability", "notice_department", "revision_date", "latest_notice_date", "official_source_url", "release_id", "evidence_as_of"], rows.map((row, index) => [index + 1, row.regulation_code, row.display_name, row.availability, row.notice_department, row.revision_date, noticeDates.get(row.regulation_version_id), row.source_location, row.release_id, release?.evidence_as_of ?? ""]));
}
export function publishNoticesToCsv(rows: PublishNoticeRow[], release: PublishReleaseMetadata) {
  return makeCsv(["row_number", "source_notice_number", "title", "posted_date", "notice_department", "source_url", "linked_regulation_count", "release_id", "evidence_as_of"], rows.map((row, index) => [index + 1, row.notice_number, row.title, row.posted_date, row.notice_department, row.source_location, row.linked_regulation_version_ids.length, row.release_id, release.evidence_as_of]));
}
