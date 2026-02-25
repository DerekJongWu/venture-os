import { NextRequest, NextResponse } from "next/server";
import { searchDocuments } from "@/lib/sync/lighthouse";

// GET /api/lighthouse/search?q=<query>
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  try {
    const docs = await searchDocuments(query);
    return NextResponse.json({ docs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
