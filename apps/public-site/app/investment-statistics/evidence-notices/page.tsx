import type { Metadata } from "next";
import { TopicDashboard } from "@/components/TopicDashboard";
import snapshot from "@/data/topic-public-v2.json";
import { getPublishDataset } from "@/lib/review-data";
import { topicNoticePublications } from "@/lib/topic-publication-view";

type Query = { family?: string; year?: string };

export const metadata: Metadata = {
  title: "근거 사규예고 | KODIT 사업별 통계",
  description: "승인된 투자·보증 주제 사규예고를 하위군·게시일·제목으로 검색하고 공식 출처를 확인합니다.",
};

export default async function EvidenceTopicNoticesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [dataset, { family, year }] = await Promise.all([getPublishDataset(), searchParams]);
  return <TopicDashboard view="evidence" initialFamily={family} initialYear={year}
    noticeRegulationStatuses={topicNoticePublications(snapshot.notices, dataset.notices, dataset.rows)}
    regulationEvidenceAsOf={dataset.release.evidence_as_of} />;
}
