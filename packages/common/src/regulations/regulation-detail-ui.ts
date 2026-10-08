import {
  availabilityOrder,
  normalizePublicSearch,
  type Availability,
  type PublicRegulationSourceRow,
  type PublishNoticeRow,
  type PublishRegulationRow,
} from "@kodit/common/regulations";

export type DetailScope = "master" | "notice" | "all" | "posts";
export type DetailField = "TITLE" | "DEPARTMENT" | "YEAR" | "ATTACHMENT_NAME" | "LINKED_REGULATION_NAME";
export type EvidenceGroup = "ALIO" | "KODIT" | "OTHER";
export type DetailDateField = "REVISION" | "LATEST_NOTICE" | "POSTED";

export type RegulationDetailSettings = {
  fields: DetailField[];
  availabilityStatuses: Availability[];
  includes: string[];
  excludes: string[];
  departments: string[];
  evidenceGroups: EvidenceGroup[];
  dateField: DetailDateField;
  startDate: string;
  endDate: string;
};

export function defaultDetailSettings(scope: DetailScope = "master"): RegulationDetailSettings {
  return {
    fields: ["TITLE", "DEPARTMENT", "YEAR"],
    availabilityStatuses: [],
    includes: [],
    excludes: [],
    departments: [],
    evidenceGroups: [],
    dateField: scope === "notice" ? "POSTED" : "LATEST_NOTICE",
    startDate: "",
    endDate: "",
  };
}

/** The two result types do not share every searchable public field or date. */
export function settingsForScope(settings: RegulationDetailSettings, scope: DetailScope): RegulationDetailSettings {
  const supported = scope === "master"
    ? settings.fields.filter(field => field !== "LINKED_REGULATION_NAME")
    : scope === "notice"
      ? settings.fields.filter(field => field !== "ATTACHMENT_NAME")
      : settings.fields.filter(field => field !== "ATTACHMENT_NAME" && field !== "LINKED_REGULATION_NAME");
  return {
    ...settings,
    fields: supported.length ? supported : defaultDetailSettings(scope).fields,
    availabilityStatuses: scope === "notice" ? [] : settings.availabilityStatuses,
    evidenceGroups: scope === "master" ? settings.evidenceGroups : [],
    dateField: scope === "notice" ? "POSTED" : scope === "all" || settings.dateField === "POSTED" ? "LATEST_NOTICE" : settings.dateField,
  };
}

/** Approved organization names, including those with no exact match; no historical-name inference. */
export type OfficialDepartmentCount = {
  name: string;
  regulationsByStatus: Record<Availability, number>;
  notices: number;
};

export function officialDepartmentCounts(
  names: readonly string[], rows: readonly PublishRegulationRow[], notices: readonly PublishNoticeRow[],
): OfficialDepartmentCount[] {
  const counts = new Map<string, OfficialDepartmentCount>(names.map(name => [name, {
    name,
    regulationsByStatus: { FULLTEXT_PUBLIC: 0, PARTIAL_PUBLIC: 0, NOTICE_ONLY: 0, SOURCE_UNKNOWN: 0 },
    notices: 0,
  }]));
  for (const row of rows) {
    const item = counts.get(row.notice_department ?? "");
    if (item) item.regulationsByStatus[row.availability]++;
  }
  for (const notice of notices) {
    const item = counts.get(notice.notice_department ?? "");
    if (item) item.notices++;
  }
  return names.map(name => counts.get(name)!);
}

export function departmentRegulationCount(option: OfficialDepartmentCount, statuses: readonly Availability[]) {
  return (statuses.length ? statuses : availabilityOrder).reduce((total, status) => total + option.regulationsByStatus[status], 0);
}

export function addDetailTerm(terms: readonly string[], value: string): string[] {
  const term = value.trim();
  if (!term || terms.length >= 3 || terms.some(existing => normalizePublicSearch(existing) === normalizePublicSearch(term))) return [...terms];
  return [...terms, term];
}

/** Calendar months relative to the static release's evidence date, never the visitor's clock. */
export function detailDateRange(asOf: string, months: 1 | 6 | 12) {
  const [year, month, day] = asOf.split("-").map(Number);
  const targetMonth = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  targetMonth.setUTCDate(Math.min(day, lastDay));
  return { startDate: targetMonth.toISOString().slice(0, 10), endDate: asOf };
}

function termsMatch(values: Array<string | null | undefined>, query: string, settings: RegulationDetailSettings) {
  const normalized = values.filter((value): value is string => Boolean(value)).map(normalizePublicSearch);
  const tokens = normalizePublicSearch(query).split(" ").filter(Boolean);
  const contains = (word: string) => normalized.some(value => value.includes(normalizePublicSearch(word)));
  return tokens.every(contains) && settings.includes.every(contains) && settings.excludes.every(word => !contains(word));
}

function dateMatches(date: string | null | undefined, settings: RegulationDetailSettings) {
  if (!settings.startDate && !settings.endDate) return true;
  return Boolean(date) && (!settings.startDate || date! >= settings.startDate) && (!settings.endDate || date! <= settings.endDate);
}

function evidenceGroup(kind: string): EvidenceGroup | null {
  if (kind === "ALIO") return "ALIO";
  if (kind === "KODIT_ATTACHMENT" || kind === "KODIT_PAGE") return "KODIT";
  if (kind === "OFFICIAL_OTHER") return "OTHER";
  return null;
}

export function filterDetailedRegulations(
  rows: PublishRegulationRow[],
  query: string,
  settings: RegulationDetailSettings,
  noticeDates: Map<string, string>,
  sourcesByVersion: Map<string, PublicRegulationSourceRow[]>,
) {
  return rows.filter(row => {
    if (settings.availabilityStatuses.length && !settings.availabilityStatuses.includes(row.availability)) return false;
    const sources = sourcesByVersion.get(row.regulation_version_id) ?? [];
    const values = settings.fields.flatMap(field => {
      if (field === "TITLE") return [row.display_name, row.normalized_name];
      if (field === "DEPARTMENT") return [row.notice_department];
      if (field === "YEAR") return [row.revision_date?.slice(0, 4)];
      if (field === "ATTACHMENT_NAME") return sources.map(source => source.attachment_name);
      return [];
    });
    if (!termsMatch(values, query, settings)) return false;
    if (settings.departments.length && !settings.departments.includes(row.notice_department ?? "")) return false;
    if (settings.evidenceGroups.length && !sources.some(source => {
      const group = evidenceGroup(source.source_kind);
      return group !== null && settings.evidenceGroups.includes(group);
    })) return false;
    return dateMatches(settings.dateField === "REVISION" ? row.revision_date : noticeDates.get(row.regulation_version_id), settings);
  });
}

export function filterDetailedNotices(
  notices: PublishNoticeRow[],
  query: string,
  settings: RegulationDetailSettings,
  regulationNames: Map<string, string>,
) {
  return notices.filter(notice => {
    const values = settings.fields.flatMap(field => {
      if (field === "TITLE") return [notice.title];
      if (field === "DEPARTMENT") return [notice.notice_department];
      if (field === "YEAR") return [notice.posted_date.slice(0, 4)];
      if (field === "LINKED_REGULATION_NAME") return notice.linked_regulation_version_ids.map(id => regulationNames.get(id));
      return [];
    });
    if (!termsMatch(values, query, settings)) return false;
    if (settings.departments.length && !settings.departments.includes(notice.notice_department ?? "")) return false;
    return dateMatches(notice.posted_date, settings);
  });
}

export function hasDetailCriteria(settings: RegulationDetailSettings, scope: DetailScope) {
  const base = defaultDetailSettings(scope);
  return (scope !== "notice" && settings.availabilityStatuses.length > 0) || settings.includes.length > 0 || settings.excludes.length > 0 || settings.departments.length > 0 || settings.evidenceGroups.length > 0 || Boolean(settings.startDate || settings.endDate) ||
    settings.fields.length !== base.fields.length || base.fields.some(field => !settings.fields.includes(field));
}
