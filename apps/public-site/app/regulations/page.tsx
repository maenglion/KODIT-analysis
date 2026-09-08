import { RegulationExplorer } from "@kodit/common/regulations/RegulationExplorer";
import { getReviewDataset } from "@/lib/review-data";

export const dynamic = "force-dynamic";

export default async function RegulationsPage() {
  const { rows, manifest } = await getReviewDataset();
  return <RegulationExplorer rows={rows} manifest={manifest} />;
}
