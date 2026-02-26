import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId) {
    return NextResponse.json({ error: "dealId required" }, { status: 400 });
  }
  const transcripts = await prisma.transcript.findMany({
    where: { deal_id: dealId },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      raw_text: true,
      processed: true,
      summary: true,
      created_at: true,
    },
  });
  return NextResponse.json(transcripts);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await prisma.transcript.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
