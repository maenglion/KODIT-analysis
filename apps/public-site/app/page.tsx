import { redirect } from "next/navigation";

type Query = Record<string, string | string[] | undefined>;

export default async function Home({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  if (typeof query.scope === "string" && ["master", "notice", "all"].includes(query.scope)) params.set("scope", query.scope);
  if (typeof query.category === "string" && ["ALL", "FULLTEXT_PUBLIC", "PARTIAL_PUBLIC", "NOTICE_ONLY", "SOURCE_UNKNOWN"].includes(query.category)) params.set("category", query.category);
  if (typeof query.q === "string" && query.q.trim()) params.set("q", query.q.slice(0, 200));
  redirect(`/regulations${params.size ? `?${params.toString()}` : ""}`);
}
