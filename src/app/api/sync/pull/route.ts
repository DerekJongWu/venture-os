import { NextResponse } from "next/server";
import { pull } from "@/lib/sync/attio";

export async function POST() {
  const result = await pull();
  return NextResponse.json(result);
}
