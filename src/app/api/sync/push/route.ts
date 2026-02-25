import { NextRequest, NextResponse } from "next/server";
import { push } from "@/lib/sync/attio";
import type { DealWithArrays } from "@/lib/deal-utils";

export async function POST(req: NextRequest) {
  const { dealId, fields } = (await req.json()) as {
    dealId: string;
    fields: Partial<DealWithArrays>;
  };

  if (!dealId) {
    return NextResponse.json({ error: "dealId is required" }, { status: 400 });
  }

  await push(dealId, fields ?? {});
  return NextResponse.json({ ok: true });
}
