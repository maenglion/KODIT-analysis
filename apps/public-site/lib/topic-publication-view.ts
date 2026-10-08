import type { Availability, PublishNoticeRow, PublishRegulationRow } from "@kodit/common/regulations";

export type TopicNoticeIdentity = {
  number: string | number;
  title: string;
  date: string;
};

export const topicNoticeKey = (notice: TopicNoticeIdentity): string =>
  JSON.stringify([String(notice.number), notice.date, notice.title]);

export type TopicNoticePublication = {
  matchedNotice: boolean;
  linkedVersionCount: number;
  knownVersionCount: number;
  statusCounts: Record<Availability, number>;
  fulltextFiles: { versionId: string; name: string; url: string }[];
};

const emptyCounts = (): Record<Availability, number> => ({
  FULLTEXT_PUBLIC: 0,
  PARTIAL_PUBLIC: 0,
  NOTICE_ONLY: 0,
  SOURCE_UNKNOWN: 0,
});

/** Only the approved notice-to-version links can place a version status beside a topic notice. */
export function topicNoticePublications(
  topics: readonly TopicNoticeIdentity[],
  approvedNotices: readonly PublishNoticeRow[],
  regulations: readonly PublishRegulationRow[],
): Record<string, TopicNoticePublication> {
  const noticesByNumber = new Map<string, PublishNoticeRow[]>();
  for (const notice of approvedNotices) {
    const number = String(notice.notice_number);
    noticesByNumber.set(number, [...(noticesByNumber.get(number) ?? []), notice]);
  }
  const versions = new Map(regulations.map((row) => [row.regulation_version_id, row]));
  const result: Record<string, TopicNoticePublication> = {};
  for (const topic of topics) {
    const candidates = (noticesByNumber.get(String(topic.number)) ?? [])
      .filter((notice) => notice.title === topic.title && notice.posted_date === topic.date);
    const item: TopicNoticePublication = {
      matchedNotice: candidates.length === 1,
      linkedVersionCount: 0,
      knownVersionCount: 0,
      statusCounts: emptyCounts(),
      fulltextFiles: [],
    };
    if (candidates.length === 1) {
      const versionIds = new Set(candidates[0].linked_regulation_version_ids);
      item.linkedVersionCount = versionIds.size;
      for (const id of versionIds) {
        const version = versions.get(id);
        if (!version) continue;
        item.statusCounts[version.availability] += 1;
        item.knownVersionCount += 1;
        if (version.availability === "FULLTEXT_PUBLIC" && version.source_location) {
          item.fulltextFiles.push({ versionId: id, name: version.display_name, url: version.source_location });
        }
      }
    }
    result[topicNoticeKey(topic)] = item;
  }
  return result;
}

export function topicPublicationDescription(value: TopicNoticePublication | undefined): string {
  if (!value?.matchedNotice) return "사규예고 대조 미확인";
  if (!value.linkedVersionCount) return "연결 규정 미확인";
  if (value.knownVersionCount !== value.linkedVersionCount) return "규정 버전 대조 미확인";
  return "";
}

export function topicEvidenceNoticesToCsv<T extends TopicNoticeIdentity & { families: readonly string[]; evidence: readonly string[]; sourceUrl?: string | null }>(
  notices: readonly T[], familyNames: ReadonlyMap<string, string>,
  publications: Readonly<Record<string, TopicNoticePublication>>, evidenceAsOf: string,
): string {
  const quote = (value: string | number) => {
    const text = String(value);
    const safe = /^[\s]*[=+\-@]/u.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const header = ["게시번호", "제목", "게시일", "승인된 하위군", "분류 근거", "공식 게시판 URL", `연결 규정 버전 공개 범위 (${evidenceAsOf})`, "연결 규정 버전 수"];
  const names: Record<Availability, string> = { FULLTEXT_PUBLIC: "전문 공개", PARTIAL_PUBLIC: "일부 공개", NOTICE_ONLY: "사전예고만", SOURCE_UNKNOWN: "출처불명" };
  const codes: Availability[] = ["FULLTEXT_PUBLIC", "PARTIAL_PUBLIC", "NOTICE_ONLY", "SOURCE_UNKNOWN"];
  const rows = notices.map((notice) => {
    const item = publications[topicNoticeKey(notice)];
    const warning = topicPublicationDescription(item);
    const statuses = warning || codes.filter((code) => item?.statusCounts[code]).map((code) => `${names[code]} ${item!.statusCounts[code]}개`).join("; ");
    return [notice.number, notice.title, notice.date, notice.families.map((code) => familyNames.get(code) ?? code).join("; "), notice.evidence.join("; "), notice.sourceUrl ?? "", statuses, item?.linkedVersionCount ?? 0];
  });
  return `\uFEFF${[header, ...rows].map((row) => row.map(quote).join(",")).join("\r\n")}\r\n`;
}
