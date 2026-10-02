import type { Metadata } from "next";
import { TopicDashboard } from "@/components/TopicDashboard";

export const metadata: Metadata = {
  title: "연도별 사규예고 | KODIT 사업별 통계",
  description: "승인된 투자·보증 주제 사규예고 62건을 게시일 연도별로 확인합니다.",
};

export default function YearlyTopicNoticesPage() {
  return <TopicDashboard view="yearly" />;
}
