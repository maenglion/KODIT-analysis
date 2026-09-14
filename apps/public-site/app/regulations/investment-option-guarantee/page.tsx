import { availabilityLabels, currentnessLabels, validPublicUrl } from "@kodit/common/regulations";
import { getPublishDataset } from "@/lib/review-data";

export const dynamic = "force-dynamic";

export default async function RegulationPage() {
  const dataset = await getPublishDataset();
  if (!dataset.available) return <main className="shell connection-state"><p className="eyebrow">규정·법령</p><h1>공개 데이터 연결 확인이 필요합니다</h1><p>승인된 publish read model에서 확인된 값만 표시합니다.</p></main>;
  const row = dataset.rows.find((item) => item.display_name === "투자옵션부보증 운용기준");
  if (!row) return <main className="shell connection-state"><p className="eyebrow">규정·법령</p><h1>승인본에서 규정을 찾을 수 없습니다</h1></main>;
  const url = validPublicUrl(row.source_location);
  return <main className="regulation-page">
    <section className="hero shell"><p className="breadcrumb">규정·법령 / 상세</p><div className="hero-grid"><div><p className="eyebrow">신용보증기금 규정</p><h1>{row.display_name}</h1><p className="revision">{row.revision_date ? `${row.revision_date.replaceAll("-", ".")} 개정` : "개정일 미기재"}</p></div>{url && <a className="source-link" href={url} target="_blank" rel="noopener noreferrer">공식 원문 열기 <span>↗</span></a>}</div></section>
    <section className="content shell"><article className="facts-panel"><div className="section-heading"><p className="eyebrow">공개 정보</p><h2>승인본 결론</h2></div><dl>
      <div><dt>공개결론</dt><dd>{availabilityLabels[row.availability]}</dd></div><div><dt>현행상태</dt><dd>{currentnessLabels[row.currentness] ?? row.currentness}</dd></div><div><dt>개정일</dt><dd>{row.revision_date ?? "미기재"}</dd></div><div><dt>사규예고 담당부서</dt><dd>{row.notice_department ?? "미기재"}</dd></div><div><dt>데이터 기준일</dt><dd>{dataset.release.evidence_as_of}</dd></div>
    </dl></article><aside className="interpretation"><p className="eyebrow">안내</p><h2>공개결론과 현행상태는<br />서로 다른 정보입니다.</h2><p>공개결론은 공식 경로에서 확인된 공개 범위를 뜻합니다. 현행상태는 별도 확인 결과이며, 확인되지 않은 경우 그대로 미확인으로 표시합니다.</p></aside></section>
  </main>;
}
