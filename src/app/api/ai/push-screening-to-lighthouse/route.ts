import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateDocument } from "@/lib/sync/lighthouse";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { dealId, content } = body as { dealId?: string; content?: string };

  if (!dealId || !content?.trim()) {
    return NextResponse.json(
      { error: "dealId and content are required" },
      { status: 400 }
    );
  }

  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }
  if (!deal.outline_doc_id) {
    return NextResponse.json(
      { error: "No Lighthouse doc linked to this deal" },
      { status: 422 }
    );
  }

  try {
    await updateDocument(deal.outline_doc_id, content);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update Lighthouse";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
