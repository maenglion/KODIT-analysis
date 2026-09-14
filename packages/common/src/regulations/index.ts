export type PublishRegulationRow = {
  release_id: string;
  regulation_version_id: string;
  regulation_code: string;
  display_name: string;
  normalized_name: string;
  availability: "FULLTEXT_PUBLIC" | "PARTIAL_PUBLIC" | "NOTICE_ONLY" | "SOURCE_UNKNOWN";
  currentness: string;
  revision_date: string | null;
  notice_department: string | null;
  official_source_available: boolean;
  source_location: string | null;
  partial_alio: boolean;
  partial_kodit_page: boolean;
  partial_attachment: boolean;
  is_new: boolean;
  is_updated: boolean;
};

export type PublishNoticeRow = {
  release_id: string;
  notice_number: string;
  title: string;
  notice_department: string | null;
  posted_date: string;
  source_location: string;
  linked_regulation_version_ids: string[];
};

export type PublishReleaseMetadata = {
  release_id: string;
  release_type: string;
  schema_version: string;
  evidence_as_of: string;
  generated_at: string;
  source_snapshot_hash: string;
  projection_hash: string;
  population: number;
};

export type PublicRegulationFilters = {
  query: string;
  availability: PublishRegulationRow["availability"] | "ALL";
  currentness: string;
  partialType: "ALL" | "ALIO" | "KODIT_PAGE" | "ATTACHMENT";
};

export const availabilityOrder: PublishRegulationRow["availability"][] = ["FULLTEXT_PUBLIC", "PARTIAL_PUBLIC", "NOTICE_ONLY", "SOURCE_UNKNOWN"];
export const availabilityLabels: Record<PublishRegulationRow["availability"], string> = {
  FULLTEXT_PUBLIC: "전문 공개", PARTIAL_PUBLIC: "일부 공개", NOTICE_ONLY: "사전예고만", SOURCE_UNKNOWN: "출처불명",
};
export const currentnessLabels: Record<string, string> = { current: "현행 확인", past: "과거", abolished: "폐지", merged: "통합", unknown: "미확인" };

export function validPublicUrl(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" ? url.href : null; } catch { return null; }
}

export function filterPublishRegulations(rows: PublishRegulationRow[], filters: PublicRegulationFilters) {
  const query = filters.query.trim().toLocaleLowerCase("ko-KR");
  return rows.filter((row) => {
    if (query && !row.display_name.toLocaleLowerCase("ko-KR").includes(query)) return false;
    if (filters.availability !== "ALL" && row.availability !== filters.availability) return false;
    if (filters.currentness && row.currentness !== filters.currentness) return false;
    if (filters.partialType === "ALIO" && !row.partial_alio) return false;
    if (filters.partialType === "KODIT_PAGE" && !row.partial_kodit_page) return false;
    if (filters.partialType === "ATTACHMENT" && !row.partial_attachment) return false;
    return true;
  });
}

const downloadColumns: [string, (row: PublishRegulationRow) => unknown][] = [
  ["regulation_code", (row) => row.regulation_code], ["regulation_name", (row) => row.display_name],
  ["availability", (row) => row.availability], ["availability_label", (row) => availabilityLabels[row.availability]],
  ["currentness", (row) => row.currentness], ["revision_date", (row) => row.revision_date],
  ["notice_department", (row) => row.notice_department], ["official_source_url", (row) => row.source_location],
  ["is_new", (row) => row.is_new], ["is_updated", (row) => row.is_updated],
];
const csvCell = (value: unknown) => { const text = String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
export function publishRowsToCsv(rows: PublishRegulationRow[]) {
  return "\uFEFF" + [downloadColumns.map(([label]) => label).join(","), ...rows.map((row) => downloadColumns.map(([, value]) => csvCell(value(row))).join(","))].join("\r\n") + "\r\n";
}
