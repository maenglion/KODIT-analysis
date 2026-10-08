import { normalizePublicSearch } from "./index";
export type PublicPost = {
  post_id: string | null; board_id: string; board_name: string; title: string;
  posted_date: string | null; document_type: string; source_url: string;
  body?: string; body_available?: boolean; public_status?: string; attachment_status?: string; source_institution?: string; external?: boolean;
  attachments: { attachment_id: string; title: string; sha256?: string }[];
};
export function filterPublicPosts(posts: PublicPost[], query: string, settings?: import("./regulation-detail-ui").RegulationDetailSettings) {
  const terms = normalizePublicSearch(query).split(" ").filter(Boolean);
  return posts.filter(post => {
    const fields = settings?.fields ?? ["TITLE", "YEAR", "ATTACHMENT_NAME", "BODY"];
    const values = fields.flatMap(field => field === "TITLE" ? [post.title, post.document_type] : field === "YEAR" ? [post.posted_date ?? ""] : field === "ATTACHMENT_NAME" ? post.attachments.map(item => item.title) : field === "BODY" && post.body_available ? [post.body ?? ""] : []);
    const text = normalizePublicSearch(values.join(" "));
    const contains = (term: string) => text.includes(normalizePublicSearch(term));
    if (!terms.every(contains) || !(settings?.includes ?? []).every(contains) || (settings?.excludes ?? []).some(contains)) return false;
    if (settings?.startDate && (!post.posted_date || post.posted_date < settings.startDate)) return false;
    if (settings?.endDate && (!post.posted_date || post.posted_date > settings.endDate)) return false;
    return true;
  }).sort((a, b) => (b.posted_date ?? "").localeCompare(a.posted_date ?? ""));
}

export type PublicPostsCoverage = {
  collected_at: string; population_complete: boolean; coverage_note: string; posts_count: number;
  boards: { board_id: string; name: string; listed_total: number | null; collected_count: number; excluded_reason: string | null; listing_complete: boolean; failed_pages: number }[];
  failures: unknown[]; body_count: number;
};

export function publicPostsToCsv(posts: PublicPost[]): string {
  const cell = (value: string) => {
    const safe = /^[\s]*[=+\-@]/u.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = posts.map(post => [post.document_type, post.title, post.board_name, post.board_id, post.post_id ?? "", post.posted_date ?? "", post.source_url, post.attachments.map(file => file.title).join("; "), post.attachments.map(file => file.attachment_id).join("; ")]);
  return "\uFEFF" + [["자료 유형", "제목", "게시판", "게시판 ID", "게시물 ID", "게시일", "공식 원문 URL", "첨부파일명", "첨부자료 ID"], ...rows].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
