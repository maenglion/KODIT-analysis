import { getPublishDataset } from "@/lib/review-data";
import { topicNoticeKey, topicNoticePublications } from "@/lib/topic-publication-view";
import { downloadZip } from "@/lib/download-zip";
import snapshot from "@/data/topic-public-v2.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const number = new URL(request.url).searchParams.get("notice");
  const matches = snapshot.notices.filter(notice => String(notice.number) === number);
  if (matches.length !== 1) return Response.json({ error: "승인된 사규예고를 특정할 수 없습니다." }, { status: 404 });
  const dataset = await getPublishDataset();
  const value = topicNoticePublications(matches, dataset.notices, dataset.rows)[topicNoticeKey(matches[0])];
  if (!value.matchedNotice || !value.fulltextFiles.length || value.fulltextFiles.length !== value.statusCounts.FULLTEXT_PUBLIC)
    return Response.json({ error: "전문 파일 연결이 완료되지 않았습니다." }, { status: 409 });
  try {
    const files = [];
    for (const [index, file] of value.fulltextFiles.entries()) {
      const url = new URL(file.url);
      if (url.protocol !== "https:" || !["www.alio.go.kr", "alio.go.kr", "www.kodit.or.kr"].includes(url.hostname)) throw new Error("unsupported_source");
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error("source_unavailable");
      const data = Buffer.from(await response.arrayBuffer());
      if (!data.length || data.length > 20 * 1024 * 1024 || /^\s*(?:<!doctype|<html)/i.test(data.subarray(0, 256).toString())) throw new Error("not_a_document");
      const type = response.headers.get("content-type") ?? "";
      const disposition = response.headers.get("content-disposition") ?? "";
      const extension = disposition.match(/\.(pdf|hwpx|hwp|docx|xlsx)(?:["';\s]|$)/i)?.[1]?.toLowerCase()
        ?? (data.subarray(0, 5).toString() === "%PDF-" ? "pdf" : data.subarray(0, 2).toString() === "PK" ? "hwpx" : type.includes("pdf") ? "pdf" : "hwp");
      files.push({ name: `${index + 1}_${file.name.replace(/[\\/:*?"<>|]/g, "_")}.${extension}`, data });
    }
    const zip = downloadZip(files);
    return new Response(new Uint8Array(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="kodit_fulltexts_${number}.zip"`, "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "공식 전문 파일을 모두 받지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
