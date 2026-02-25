import { NextRequest, NextResponse } from "next/server";
import { fetchDocument, updateDocument } from "@/lib/sync/lighthouse";

// GET /api/lighthouse/document?docId=<id>
export async function GET(req: NextRequest) {
  const docId = req.nextUrl.searchParams.get("docId");
  if (!docId) {
    return NextResponse.json({ error: "docId is required" }, { status: 400 });
  }

  try {
    const content = await fetchDocument(docId);
    return NextResponse.json({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// PUT /api/lighthouse/document
// Body: { docId: string; content: string }
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { docId, content } = body as { docId?: string; content?: string };

  if (!docId || typeof content !== "string") {
    return NextResponse.json(
      { error: "docId and content are required" },
      { status: 400 }
    );
  }

  try {
    await updateDocument(docId, content);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
