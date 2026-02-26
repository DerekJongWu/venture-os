// GET /api/sync/logs    — last 50 SyncLog entries (most recent first)
// DELETE /api/sync/logs — clear all SyncLog entries

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const logs = await prisma.syncLog.findMany({
    orderBy: { synced_at: "desc" },
    take: 50,
  });
  return NextResponse.json(logs);
}

export async function DELETE() {
  await prisma.syncLog.deleteMany({});
  return NextResponse.json({ ok: true });
}
