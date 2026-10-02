import type { Metadata } from "next";
import { TopicDashboard } from "@/components/TopicDashboard";

export const metadata: Metadata = {
  title: "투자·보증 주제 분석 | KODIT 규정 아카이브",
  description: "승인된 투자·보증 주제의 9개 하위군과 62건 사규예고를 정적 검증본으로 살펴봅니다.",
};

export default function InvestmentStatisticsPage() {
  return <TopicDashboard />;
}
