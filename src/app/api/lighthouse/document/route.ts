import { NextRequest, NextResponse } from "next/server";
import {
  fetchDocument,
  fetchDocumentByCompanyName,
  updateDocument,
} from "@/lib/sync/lighthouse";

// GET /api/lighthouse/document?companyName=<name>  OR  ?docId=<id>
// By company name: search_documents → read_document, returns { content, documentId }.
// By docId: read_document only, returns { content, documentId }.
export async function GET(req: NextRequest) {
  const companyName = req.nextUrl.searchParams.get("companyName");
  const docId = req.nextUrl.searchParams.get("docId");

  if (companyName) {
    try {
      const { content, documentId } =
        await fetchDocumentByCompanyName(companyName);
      return NextResponse.json({ content, documentId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (docId) {
    try {
      const content = await fetchDocument(docId);
      return NextResponse.json({ content, documentId: docId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  return NextResponse.json(
    { error: "companyName or docId is required" },
    { status: 400 }
  );
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
