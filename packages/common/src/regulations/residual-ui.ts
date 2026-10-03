import {
  publicResidualLabel,
  residualLabelsToCsv,
  residualOccurrencesToCsv,
  validPublicUrl,
  type DepartmentResidualLabelRow,
  type DepartmentResidualOccurrenceRow,
  type ResidualResolutionClass,
} from "@kodit/common/regulations";

export const RESIDUAL_PAGE_SIZE = 10;
export type ResidualSort = "LABEL_ASC" | "LABEL_DESC" | "NOTICE_DESC" | "OCCURRENCE_DESC" | "RECENT_DESC";

/** These are the only PERSON fields crossing the server → client boundary. No ledger IDs or attribution schema. */
export type PersonObservation = {
  alias: string;
  observed_at: string;
  notice_title: string;
  official_url: string;
};
export type PersonObservationSummary = {
  alias: string;
  first_observed_at: string | null;
  last_observed_at: string | null;
  observation_count: number;
  notice_count: number;
  mention_count: number;
  source_urls: string[];
};

function personAlias(row: { resolution_class: string; label_type: string; raw_label: string }): string {
  if (row.resolution_class !== "PERSON_EVIDENCE" || row.label_type !== "PERSON" || !/^[ㄱ-ㅎ]+\(\d{4}\)$/.test(row.raw_label)) {
    throw new Error("PERSON 공개 별칭/유형 계약 불일치");
  }
  return row.raw_label;
}

/** Current approved PERSON citations all point to the official KODIT rule-notice board list. */
function officialNoticeUrl(value: string): string {
  const url = validPublicUrl(value);
  if (!url) throw new Error("PERSON 공식 게시물 URL 누락 또는 형식 오류");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.kodit.or.kr" || parsed.port || parsed.username || parsed.password ||
      !parsed.pathname.endsWith("/selectNttList.do") || parsed.searchParams.get("bbsId") !== "322") {
    throw new Error("PERSON 공식 게시물 URL 출처 계약 불일치");
  }
  return parsed.href;
}

export function publicPersonObservation(row: DepartmentResidualOccurrenceRow): PersonObservation {
  const alias = personAlias(row);
  return { alias, observed_at: row.posted_at, notice_title: row.title, official_url: officialNoticeUrl(row.source_location) };
}

export function publicPersonSummary(row: DepartmentResidualLabelRow): PersonObservationSummary {
  const alias = personAlias(row);
  return {
    alias, first_observed_at: row.first_seen_at, last_observed_at: row.last_seen_at,
    observation_count: row.residual_occurrence_count, notice_count: row.notice_count,
    mention_count: row.mention_occurrence_count,
    source_urls: row.mention_source_locations.map(officialNoticeUrl),
  };
}

const korean = new Intl.Collator("ko-KR", { numeric: true });

export function selectResidualLabels(
  summary: DepartmentResidualLabelRow[],
  selectedClasses: readonly ResidualResolutionClass[],
  sort: ResidualSort,
) {
  const accepted = new Set(selectedClasses);
  const compareLabel = (a: DepartmentResidualLabelRow, b: DepartmentResidualLabelRow) =>
    korean.compare(publicResidualLabel(a.raw_label, a.label_type), publicResidualLabel(b.raw_label, b.label_type)) ||
    a.label_id.localeCompare(b.label_id);
  return summary.filter(row => accepted.has(row.resolution_class)).sort((a, b) => {
    if (sort === "LABEL_ASC") return compareLabel(a, b);
    if (sort === "LABEL_DESC") return compareLabel(b, a);
    if (sort === "NOTICE_DESC") return Number(b.notice_count) - Number(a.notice_count) || compareLabel(a, b);
    if (sort === "RECENT_DESC") return (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? "") || compareLabel(a, b);
    return Number(b.residual_occurrence_count) - Number(a.residual_occurrence_count) || compareLabel(a, b);
  });
}

/** Download the whole filtered set, not just the visible ten-row page. */
export function residualOccurrencesForLabels(
  occurrences: DepartmentResidualOccurrenceRow[],
  labels: DepartmentResidualLabelRow[],
) {
  const positions = new Map(labels.map((row, index) => [row.label_id, index]));
  return occurrences.filter(row => positions.has(row.label_id)).sort((a, b) =>
    positions.get(a.label_id)! - positions.get(b.label_id)! || b.posted_at.localeCompare(a.posted_at) || a.residual_id.localeCompare(b.residual_id),
  );
}

const csvCell = (value: unknown) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const safeCsv = (columns: string[], rows: unknown[][]) => "\uFEFF" + [columns.join(","), ...rows.map(row => row.map(csvCell).join(","))].join("\r\n") + "\r\n";

/** Mixed/PERSON downloads use a common observation-only schema: no ledger or organization columns. */
export function publicResidualOccurrencesToCsv(rows: DepartmentResidualOccurrenceRow[]) {
  if (!rows.some(row => row.resolution_class === "PERSON_EVIDENCE")) return residualOccurrencesToCsv(rows);
  return safeCsv(["display_label", "resolution_class", "posted_at", "title", "source_url", "observation_count"], rows.map(row => {
    const safe = row.resolution_class === "PERSON_EVIDENCE" ? publicPersonObservation(row) : null;
    return [safe?.alias ?? publicResidualLabel(row.raw_label, row.label_type), row.resolution_class, row.posted_at, row.title, safe?.official_url ?? row.source_location, 1];
  }));
}

export function publicResidualLabelsToCsv(rows: DepartmentResidualLabelRow[]) {
  if (!rows.some(row => row.resolution_class === "PERSON_EVIDENCE")) return residualLabelsToCsv(rows);
  return safeCsv(["display_label", "resolution_class", "first_seen_at", "last_seen_at", "observation_count", "notice_count", "mention_count", "official_source_urls"], rows.map(row => {
    const safe = row.resolution_class === "PERSON_EVIDENCE" ? publicPersonSummary(row) : null;
    return [safe?.alias ?? publicResidualLabel(row.raw_label, row.label_type), row.resolution_class, row.first_seen_at, row.last_seen_at,
      row.residual_occurrence_count, row.notice_count, row.mention_occurrence_count, safe?.source_urls.join(" ; ") ?? ""];
  }));
}

export type MentionSourceLink = { url: string; label: string };

/** A board list is not a single notice; name it with the official page title, never an arbitrary notice title. */
export function mentionSourceLinks(
  sourceLocations: string[],
  occurrences: Pick<DepartmentResidualOccurrenceRow, "source_location" | "title">[],
): MentionSourceLink[] {
  const locations = [...new Set(sourceLocations.map(validPublicUrl).filter((url): url is string => Boolean(url)))];
  const names = locations.map(url => {
    const page = new URL(url);
    if (page.hostname === "www.kodit.or.kr" && page.pathname.endsWith("/selectNttList.do") && page.searchParams.get("bbsId") === "322") {
      return "사규 제개정 예고";
    }
    const titles = [...new Set(occurrences.filter(row => validPublicUrl(row.source_location) === url).map(row => row.title.trim()).filter(Boolean))];
    return titles.length === 1 ? titles[0] : "본문 근거 원문";
  });
  const totals = new Map<string, number>();
  names.forEach(name => totals.set(name, (totals.get(name) ?? 0) + 1));
  const seen = new Map<string, number>();
  return locations.map((url, index) => {
    const name = names[index];
    const ordinal = (seen.get(name) ?? 0) + 1;
    seen.set(name, ordinal);
    return { url, label: (totals.get(name) ?? 0) > 1 ? `${name} (${ordinal})` : name };
  });
}
