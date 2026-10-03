import { notFound } from "next/navigation";
import { DepartmentStatistics } from "@kodit/common/regulations/DepartmentStatistics";
import { organizationSnapshot } from "@kodit/common/regulations";
import { CollectionStatus } from "@/components/CollectionStatus";
import { DataPurposePage, MethodologyPage, TechnicalSpecsPage } from "@/components/InformationPages";
import { getPublishDataset } from "@/lib/review-data";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "department-statistics") return <DepartmentStatisticsPage />;
  if (section === "data-purpose") return <DataPurposePage />;
  if (section === "methodology") return <MethodologyPage />;
  if (section === "technical-specs") return <TechnicalSpecsPage />;
  notFound();
}

async function DepartmentStatisticsPage() {
  const dataset = await getPublishDataset();
  return <DepartmentStatistics rows={dataset.rows} notices={dataset.notices} sources={dataset.sources} metadataSlot={<CollectionStatus evidenceAsOf={dataset.release.evidence_as_of} basisLabel="규정·예고" additionalBases={[{ label: "조직도", date: organizationSnapshot.snapshotDate }]} snapshotGeneratedAt={dataset.release.generated_at} generationSource="규정 공개본" />} />;
}
