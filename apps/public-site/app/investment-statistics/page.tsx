import type { Metadata } from "next";
import { TopicDashboard } from "@/components/TopicDashboard";
import snapshot from "@/data/topic-public-v2.json";
import { getPublishDataset } from "@/lib/review-data";
import { topicRegulationAvailability } from "@/lib/topic-notice-filter";

export const metadata: Metadata = {
  title: "투자·보증 주제 분석 | KODIT 규정 아카이브",
  description: "승인된 투자·보증 주제의 9개 하위군과 62건 사규예고를 정적 검증본으로 살펴봅니다.",
};

export default async function InvestmentStatisticsPage() {
  const dataset = await getPublishDataset();
  const rankedNames = [...snapshot.mostMentioned, ...snapshot.mostProposed].map((item) => item.name);
  return <TopicDashboard
    regulationAvailabilityByName={topicRegulationAvailability(rankedNames, dataset.rows)}
    regulationEvidenceAsOf={dataset.release.evidence_as_of}
  />;
}
