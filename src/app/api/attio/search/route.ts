import { NextRequest, NextResponse } from "next/server";
import { searchAttio } from "@/lib/sync/attio";
import type { AttioSearchResult } from "@/lib/sync/attio";

// Re-export for consumers that import the type from this module
export type { AttioSearchResult };

// GET /api/attio/search?q=<query>
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";

  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchAttio(q);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    const status = message.includes("not configured") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
