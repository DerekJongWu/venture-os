import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export interface SyncStatusResponse {
  status: "success" | "error" | null;
  last_synced_at: string | null;
  error: string | null;
}

export async function GET() {
  // The pull() function writes a summary SyncLog entry with
  // entity_type="sync", entity_id="attio_pull" after every run.
  const latest = await prisma.syncLog.findFirst({
    where: { entity_type: "sync", entity_id: "attio_pull" },
    orderBy: { synced_at: "desc" },
  });

  if (!latest) {
    return NextResponse.json<SyncStatusResponse>({
      status: null,
      last_synced_at: null,
      error: null,
    });
  }

  return NextResponse.json<SyncStatusResponse>({
    status: latest.status as "success" | "error",
    last_synced_at: latest.synced_at.toISOString(),
    error: latest.error ?? null,
  });
}
