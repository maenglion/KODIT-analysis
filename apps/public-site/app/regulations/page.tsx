import { RegulationExplorer } from "@kodit/common/regulations/RegulationExplorer";
import { organizationSnapshot } from "@kodit/common/regulations";
import { CollectionStatus } from "@/components/CollectionStatus";
import { PublicInsightStrip, type InsightMetric, type InsightTerm } from "@/components/PublicInsightStrip";
import { getPublishDataset, getPublicPosts, getPublicPostsCoverage, getExternalPublicPosts } from "@/lib/review-data";

export const dynamic = "force-dynamic";

export default async function RegulationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const dataset = await getPublishDataset();
  const publicPosts = await getPublicPosts();
  const postsCoverage = await getPublicPostsCoverage();
  const externalPosts = await getExternalPublicPosts();
  const query = await searchParams;
  const scope = ["master", "notice", "all", "posts"].includes(String(query.scope)) ? String(query.scope) as "master" | "notice" | "all" | "posts" : "master";
  const category = ["ALL", "FULLTEXT_PUBLIC", "PARTIAL_PUBLIC", "NOTICE_ONLY", "SOURCE_UNKNOWN"].includes(String(query.category)) ? String(query.category) as "ALL" | "FULLTEXT_PUBLIC" | "PARTIAL_PUBLIC" | "NOTICE_ONLY" | "SOURCE_UNKNOWN" : "ALL";
  const q = typeof query.q === "string" ? query.q : "";
  const noticeCount = dataset.notices.length;
  const personCount = dataset.personResidualObservations.length;
  const currentCount = dataset.residuals.filter(row => row.resolution_class === "ORG_CURRENT").length;
  const historicalCount = dataset.residuals.filter(row => row.resolution_class === "ORG_HISTORICAL").length;
  const untypedCount = dataset.residuals.filter(row => row.resolution_class === "UNTYPED").length;
  const ambiguousCount = dataset.residuals.filter(row => row.resolution_class === "AMBIGUOUS").length;
  const unmatchedCount = personCount + dataset.residuals.length;
  const confirmedCount = currentCount + historicalCount;
  const classifiedCount = personCount + confirmedCount;
  if (noticeCount === 0 || unmatchedCount > noticeCount || classifiedCount + untypedCount + ambiguousCount !== unmatchedCount) {
    throw new Error("담당 표기 대조 집계 단위가 승인 공개본과 일치하지 않습니다.");
  }
  const format = (count: number) => count.toLocaleString("ko-KR");
  const percent = (count: number) => `${(count / noticeCount * 100).toFixed(1)}%`;
  const officialCount = organizationSnapshot.hierarchy.flatMap(group => group.units).length;
  const terms: InsightTerm[] = [
    { id: "initial", label: "초기 미일치", short: "담당 표기가 기준 조직명과 글자 그대로 일치하지 않은 게시물입니다.", detail: `사규예고의 담당 표기에서 앞뒤 공백을 제거한 뒤, ${organizationSnapshot.snapshotDate} 기준 공식 조직명 ${officialCount}개와 문자열이 정확히 같은지 비교한 결과입니다. 유사한 이름이나 과거 조직명은 자동으로 같은 조직으로 처리하지 않았습니다.` },
    { id: "person", label: "인물형 관측", short: "담당 표기와 같은 문자열이 다른 문서 본문에서 인물형 문맥으로 관측된 건수입니다.", detail: "담당 표기와 같은 문자열이 다른 문서 본문에서 인물형 문맥으로 관측된 건수입니다. 실제 인물의 신원, 직원 여부, 기안자·담당자 역할 또는 소속을 확정하지 않습니다. 공개 화면에서는 초성 기반 공개 별칭과 관측 게시물만 표시합니다." },
    { id: "organization", label: "공식 근거로 조직 확인", short: "공식 근거에서 현재 또는 과거 조직을 확인한 건수입니다.", detail: `공식 조직자료 또는 보존된 시점 근거에서 현재 조직이나 과거 조직을 확인한 기록입니다. 현재 조직 확인 ${format(currentCount)}건과 과거 조직 확인 ${format(historicalCount)}건을 합한 수치입니다.` },
    { id: "untyped", label: "유형 미확정", short: "근거만으로 사람·조직 등 표기의 유형을 정하지 않은 건수입니다.", detail: "원문 표기는 존재하지만 현재 확보한 근거만으로 사람·조직 등 표기의 유형을 정하지 않은 기록입니다. 데이터 오류나 자료 부재를 뜻하지 않습니다." },
  ];
  const metrics: InsightMetric[] = [
    { termId: "person", value: `${format(personCount)}건` },
    { termId: "organization", value: `${format(confirmedCount)}건` },
    { termId: "untyped", value: `${format(untypedCount)}건 (전체 사규예고의 ${percent(untypedCount)})` },
  ];
  if (ambiguousCount > 0) metrics.push({ termId: "ambiguous", value: `${format(ambiguousCount)}건` });
  if (ambiguousCount > 0) terms.push({ id: "ambiguous", label: "복수 유형 관측", short: "한 담당 표기에서 복수 유형의 근거가 관측됐습니다.", detail: "서로 다른 유형의 관측이 겹친 경우입니다. 단일 조직·인물로 자동 확정하지 않습니다." });

  return <RegulationExplorer key={`${scope}:${category}:${q}`} publicPosts={publicPosts} postsCoverage={postsCoverage} externalPosts={externalPosts} rows={dataset.rows} notices={dataset.notices} sources={dataset.sources} release={dataset.release} initialScope={scope} initialQuery={q} initialCategory={category}
    metadataSlot={<CollectionStatus evidenceAsOf={dataset.release.evidence_as_of} snapshotGeneratedAt={dataset.release.generated_at} />}
    insightSlot={<PublicInsightStrip
      eyebrow="승인 공개본 대조"
      title="담당 표기 대조 결과"
      description={[`전체 사규예고 ${format(noticeCount)}건 가운데 `, { termId: "initial" }, ` ${format(unmatchedCount)}건(${percent(unmatchedCount)})은 앞뒤 공백을 제거한 담당 표기가 공식 조직명 ${officialCount}개와 정확히 일치하지 않았습니다. 이 중 ${format(classifiedCount)}건은 표기의 유형을 구분하거나 공식 조직 근거를 확인했습니다.`]}
      metrics={metrics} disclosureTerms={terms} href="/residual-data#residual-index" linkLabel="잔차 처리 결과 보기"
      evidenceBasis={`사규예고 ${dataset.release.evidence_as_of} 기준 · 공식 조직도 ${organizationSnapshot.snapshotDate} 기준`}
      note="이 수치는 부서 재배정 건수가 아닙니다. 문서 본문 추출 실패나 DRM 건수와도 별개의 통계입니다."
    />}
  />;
}
