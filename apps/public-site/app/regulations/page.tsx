import { RegulationExplorer } from "@kodit/common/regulations/RegulationExplorer";
import { CollectionStatus } from "@/components/CollectionStatus";
import { getPublishDataset } from "@/lib/review-data";

export const dynamic = "force-dynamic";

export default async function RegulationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const dataset = await getPublishDataset();
  const query = await searchParams;
  const scope = ["master", "notice", "all"].includes(String(query.scope)) ? String(query.scope) as "master" | "notice" | "all" : "master";
  const category = ["ALL", "FULLTEXT_PUBLIC", "PARTIAL_PUBLIC", "NOTICE_ONLY", "SOURCE_UNKNOWN"].includes(String(query.category)) ? String(query.category) as "ALL" | "FULLTEXT_PUBLIC" | "PARTIAL_PUBLIC" | "NOTICE_ONLY" | "SOURCE_UNKNOWN" : "ALL";
  const q = typeof query.q === "string" ? query.q : "";
  return <RegulationExplorer key={`${scope}:${category}:${q}`} rows={dataset.rows} notices={dataset.notices} sources={dataset.sources} release={dataset.release} initialScope={scope} initialQuery={q} initialCategory={category} metadataSlot={<CollectionStatus evidenceAsOf={dataset.release.evidence_as_of} snapshotGeneratedAt={dataset.release.generated_at} />} />;
}
