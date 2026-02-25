import { NextRequest, NextResponse } from "next/server";
import { addDeal } from "@/lib/sync/attio";

export async function POST(req: NextRequest) {
  const { attio_entry_id } = (await req.json()) as {
    attio_entry_id: string;
  };

  if (!attio_entry_id) {
    return NextResponse.json(
      { error: "attio_entry_id is required" },
      { status: 400 }
    );
  }

  try {
    const deal = await addDeal(attio_entry_id);
    return NextResponse.json(deal, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add deal";
    const status = message.includes("not configured") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
