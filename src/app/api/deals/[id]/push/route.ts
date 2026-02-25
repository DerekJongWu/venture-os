import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { push } from "@/lib/sync/attio";
import { parseDealArrays } from "@/lib/deal-utils";

type Params = { params: { id: string } };

export async function POST(_req: NextRequest, { params }: Params) {
  const deal = await prisma.deal.findUnique({ where: { id: params.id } });
  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await push(params.id, parseDealArrays(deal));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Push failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
