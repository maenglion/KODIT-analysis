import {
  publicResidualLabel,
  validPublicUrl,
  type DepartmentResidualLabelRow,
  type DepartmentResidualOccurrenceRow,
  type ResidualResolutionClass,
} from "@kodit/common/regulations";

export const RESIDUAL_PAGE_SIZE = 10;
export type ResidualSort = "LABEL_ASC" | "LABEL_DESC" | "NOTICE_DESC" | "OCCURRENCE_DESC" | "RECENT_DESC";

/** Public-safe notice-work labels only. No person identity, organization candidate, scoring, or provenance. */
export const PUBLIC_PERSON_NOTICE_BASIS = {
  INFERRED_WORK_SIMILARITY: "추정(업무 유사)",
  INFERRED_SEMANTIC_CANDIDATE: "추정(시맨틱 후보)",
  INSUFFICIENT_EVIDENCE: "근거 부족",
} as const;
export type PersonNoticeBasisLabel = typeof PUBLIC_PERSON_NOTICE_BASIS[keyof typeof PUBLIC_PERSON_NOTICE_BASIS];

export function publicPersonNoticeBasis(code: string, label: string): PersonNoticeBasisLabel {
  const expected = (PUBLIC_PERSON_NOTICE_BASIS as Record<string, string>)[code];
  if (!expected || expected !== label) throw new Error(`승인되지 않은 PERSON 게시물 판정 코드·라벨: ${code}`);
  return expected as PersonNoticeBasisLabel;
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
