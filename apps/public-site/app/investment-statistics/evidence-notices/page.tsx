import type { Metadata } from "next";
import { TopicDashboard } from "@/components/TopicDashboard";

type Query = { family?: string; year?: string };

export const metadata: Metadata = {
  title: "근거 사규예고 | KODIT 사업별 통계",
  description: "승인된 투자·보증 주제 사규예고를 하위군·게시일·제목으로 검색하고 공식 출처를 확인합니다.",
};

export default async function EvidenceTopicNoticesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { family, year } = await searchParams;
  return <TopicDashboard view="evidence" initialFamily={family} initialYear={year} />;
}
