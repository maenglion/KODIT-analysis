import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const unavailable = () => NextResponse.json({ available: false }, { headers: { "Cache-Control": "no-store" } });
const expectedHost = "jacyalxzejzrlspmojps.supabase.co";

type CollectionStateRow = {
  last_checked_at: string | null;
  last_successful_at: string | null;
  recent_status: string;
  next_due_at: string | null;
  human_review_pending_count: number | null;
};

export async function GET() {
  const serverUrl = process.env.KODIT_SUPABASE_URL;
  const serverKey = process.env.KODIT_SUPABASE_PUBLISHABLE_KEY;
  const supabaseUrl = serverUrl && serverKey ? serverUrl : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = serverUrl && serverKey ? serverKey : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return unavailable();

  try {
    const base = new URL(supabaseUrl);
    // This site's KODIT status must never be read from a different project.
    if (base.protocol !== "https:" || base.hostname !== expectedHost) return unavailable();
    const endpoint = new URL("/rest/v1/rpc/public_collection_state", base);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        "Content-Type": "application/json",
        "Content-Profile": "api",
        "Accept-Profile": "api",
      },
      body: "{}",
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) return unavailable();
    const value: unknown = await response.json();
    const row = Array.isArray(value) ? value[0] as Partial<CollectionStateRow> | undefined : undefined;
    if (!row || typeof row.recent_status !== "string") return unavailable();
    const dateOrNull = (input: unknown) => typeof input === "string" && !Number.isNaN(Date.parse(input)) ? input : null;
    const pending = Number(row.human_review_pending_count ?? 0);
    return NextResponse.json({
      available: true,
      lastCheckedAt: dateOrNull(row.last_checked_at),
      lastSuccessfulAt: dateOrNull(row.last_successful_at),
      recentStatus: row.recent_status,
      nextDueAt: dateOrNull(row.next_due_at),
      reviewPendingCount: Number.isFinite(pending) && pending >= 0 ? pending : 0,
    }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
  } catch {
    // Status availability must never block or alter the approved static regulation list.
    return unavailable();
  }
}
