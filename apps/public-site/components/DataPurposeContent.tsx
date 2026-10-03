import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CollectionStatus } from "@/components/CollectionStatus";
import { getPublishDataset } from "@/lib/review-data";
import manuscript from "@/content/data-purpose.md";
import history from "@/data/data-purpose-history.json";

type EditorialRevision = { date: string; summary: string; contentSha256: string };

const relatedDestinations = new Map([
  ["규정 공개 현황", "/regulations"],
  ["사규예고 공개 현황", "/regulations?scope=notice"],
  ["검증 방법론", "/methodology"],
  ["기술 사양", "/technical-specs"],
]);

const markdownComponents = {
  table: ({ children }: { children?: React.ReactNode }) =>
    <div className="information-table-scroll"><table className="information-table">{children}</table></div>,
};

function RevisionHistory() {
  const revisions = history.revisions as EditorialRevision[];
  return <details className="purpose-history">
    <summary>변경이력({revisions.length})</summary>
    <div className="purpose-history-detail">
      <p>이 안내문을 기준본으로 정한 {history.baselineEstablishedOn} 이후의 수정 이력입니다. 규정·수집 데이터의 변경 이력과는 별개입니다.</p>
      {revisions.length === 0
        ? <p>기준본 이후 기록된 수정이 없습니다.</p>
        : <ol>{revisions.map((revision) => <li key={revision.contentSha256}><time dateTime={revision.date}>{revision.date}</time> · {revision.summary}</li>)}</ol>}
    </div>
  </details>;
}

export async function DataPurposePage() {
  const { release } = await getPublishDataset();
  const [hero, ...parts] = manuscript.trim().split(/^\s*---\s*$/m).map((part) => part.trim());
  const relatedPart = parts.at(-1) ?? "";
  const chapters = parts.slice(0, -1).map((part, index) => {
    const [heading, ...body] = part.split("\n");
    return { id: `purpose-chapter-${index + 1}`, title: heading.replace(/^##\s+/, ""), body: body.join("\n").trim() };
  });
  const relatedTitle = relatedPart.split("\n")[0]?.replace(/^##\s+/, "") ?? "";
  const relatedLabels = [...relatedPart.matchAll(/^- \*\*(.+?)\*\*\s*$/gm)].map((match) => match[1]);

  return <>
    <header className="methodology-hero information-hero purpose-hero">
      <div className="shell intro-inner intro-inner-with-status purpose-hero-inner"><div className="purpose-hero-copy"><Markdown remarkPlugins={[remarkGfm]}>{hero}</Markdown></div><CollectionStatus evidenceAsOf={release.evidence_as_of} basisLabel="규정·예고" snapshotGeneratedAt={release.generated_at} generationSource="규정 공개본" /></div>
    </header>
    <main className="methodology-page information-page purpose-page"><div className="shell">
      {chapters.map((chapter, index) => <section className="information-section purpose-section" id={chapter.id} key={chapter.id}>
        <div className="information-section-title purpose-section-title">
          <h2>{chapter.title}</h2>{index === 0 && <RevisionHistory />}
        </div>
        <div className="information-section-content purpose-copy"><Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{chapter.body}</Markdown></div>
      </section>)}
      <nav className="purpose-related" aria-label={relatedTitle}>
        <h2>{relatedTitle}</h2>
        <ul>{relatedLabels.map((label) => <li key={label}><Link href={relatedDestinations.get(label) ?? "/regulations"}>{label}</Link></li>)}</ul>
      </nav>
    </div></main>
  </>;
}
