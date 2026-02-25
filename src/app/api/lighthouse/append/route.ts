import { NextRequest, NextResponse } from "next/server";
import { appendToDocument } from "@/lib/sync/lighthouse";

// POST /api/lighthouse/append
// Body: { docId: string; block: string }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { docId, block } = body as { docId?: string; block?: string };

  if (!docId || typeof block !== "string") {
    return NextResponse.json(
      { error: "docId and block are required" },
      { status: 400 }
    );
  }

  try {
    await appendToDocument(docId, block);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
