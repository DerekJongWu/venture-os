import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDealArrays, serializeJsonArray } from "@/lib/deal-utils";
import { resyncDeal } from "@/lib/sync/attio";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      notes: { orderBy: { created_at: "desc" } },
      transcripts: { orderBy: { created_at: "desc" } },
      dataroom_files: { orderBy: { uploaded_at: "desc" } },
    },
  });
  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(parseDealArrays(deal));
}

// Array fields that must be serialized before writing to SQLite
const ARRAY_FIELDS = [
  "fund",
  "dd_lead",
  "deal_support",
  "thesis",
  "pass_rationale",
] as const;

export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json();

  // Never allow lighthouse_url or identity fields to be overwritten
  delete body.lighthouse_url;
  delete body.id;
  delete body.attio_record_id;
  delete body.attio_entry_id;

  // Serialize array fields for SQLite storage
  for (const field of ARRAY_FIELDS) {
    if (Array.isArray(body[field])) {
      body[field] = serializeJsonArray(body[field]);
    }
  }

  const deal = await prisma.deal.update({
    where: { id: params.id },
    data: { ...body, updated_at: new Date() },
  });

  return NextResponse.json(parseDealArrays(deal));
}

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const deal = await resyncDeal(params.id);
    return NextResponse.json(deal);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    const status = message.includes("not configured") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await prisma.deal.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
