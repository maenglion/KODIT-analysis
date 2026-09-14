import { RegulationExplorer } from "@kodit/common/regulations/RegulationExplorer";
import { getPublishDataset } from "@/lib/review-data";

export const dynamic = "force-dynamic";

export default async function RegulationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const dataset = await getPublishDataset();
  if (!dataset.available) return <main className="shell connection-state"><p className="eyebrow">규정·법령</p><h1>공개 데이터 연결 확인이 필요합니다</h1><p>확인되지 않은 수치를 대신 표시하지 않습니다. 승인된 publish read model 연결이 복구되면 목록이 표시됩니다.</p></main>;
  const query = await searchParams;
  const scope = ["master", "notice", "all"].includes(String(query.scope)) ? String(query.scope) as "master" | "notice" | "all" : "master";
  const category = ["ALL", "FULLTEXT_PUBLIC", "PARTIAL_PUBLIC", "NOTICE_ONLY", "SOURCE_UNKNOWN"].includes(String(query.category)) ? String(query.category) as "ALL" | "FULLTEXT_PUBLIC" | "PARTIAL_PUBLIC" | "NOTICE_ONLY" | "SOURCE_UNKNOWN" : "ALL";
  return <RegulationExplorer rows={dataset.rows} notices={dataset.notices} sources={dataset.sources} release={dataset.release} initialScope={scope} initialQuery={typeof query.q === "string" ? query.q : ""} initialCategory={category} />;
}
