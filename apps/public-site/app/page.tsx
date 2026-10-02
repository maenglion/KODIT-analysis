import type { Metadata } from "next";
import { RegulationExplorer } from "@kodit/common/regulations/RegulationExplorer";
import { getPublishDataset } from "@/lib/review-data";

export const metadata: Metadata = {
  title: "신용보증기금 규정 공개현황 | KODIT",
  description: "신용보증기금의 내부규정과 사규예고를 검색하고 승인된 공식 근거·공개 범위를 확인합니다.",
};

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;

export default async function Home({ searchParams }: { searchParams: Promise<Query> }) {
  const [dataset, query] = await Promise.all([getPublishDataset(), searchParams]);
  const scope = ["master", "notice", "all"].includes(String(query.scope))
    ? String(query.scope) as "master" | "notice" | "all" : "master";
  const category = ["ALL", "FULLTEXT_PUBLIC", "PARTIAL_PUBLIC", "NOTICE_ONLY", "SOURCE_UNKNOWN"].includes(String(query.category))
    ? String(query.category) as "ALL" | "FULLTEXT_PUBLIC" | "PARTIAL_PUBLIC" | "NOTICE_ONLY" | "SOURCE_UNKNOWN" : "ALL";
  const q = typeof query.q === "string" ? query.q : "";
  return <RegulationExplorer key={`${scope}:${category}:${q}`} rows={dataset.rows} notices={dataset.notices} sources={dataset.sources} release={dataset.release} initialScope={scope} initialQuery={q} initialCategory={category} />;
}
