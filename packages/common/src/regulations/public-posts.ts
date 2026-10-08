import { normalizePublicSearch } from "./index";
export type PublicPost = {
  post_id: string; board_id: string; board_name: string; title: string;
  posted_date: string | null; document_type: string; source_url: string;
  body?: string; body_available?: boolean; public_status?: string; attachment_status?: string; source_institution?: string; external?: boolean;
  attachments: { attachment_id: string; title: string; sha256?: string }[];
};
export function filterPublicPosts(posts: PublicPost[], query: string) {
  const terms = normalizePublicSearch(query).split(" ").filter(Boolean);
  return posts.filter(post => {
    const text = normalizePublicSearch([post.title, post.document_type, post.board_name, ...post.attachments.map(item => item.title), ...(post.body_available && post.body ? [post.body] : [])].join(" "));
    return terms.every(term => text.includes(term));
  }).sort((a, b) => (b.posted_date ?? "").localeCompare(a.posted_date ?? ""));
}

export type PublicPostsCoverage = {
  collected_at: string; population_complete: boolean; coverage_note: string; posts_count: number;
  boards: { board_id: string; name: string; listed_total: number | null; collected_count: number; excluded_reason: string | null; listing_complete: boolean; failed_pages: number }[];
  failures: unknown[]; body_count: number;
};
