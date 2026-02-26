import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import path from "path";

// GET /api/dataroom?dealId={id} — list files for a deal
export async function GET(req: NextRequest) {
  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId) {
    return NextResponse.json({ error: "dealId required" }, { status: 400 });
  }

  const files = await prisma.dataRoomFile.findMany({
    where: { deal_id: dealId },
    orderBy: { uploaded_at: "desc" },
  });

  return NextResponse.json(files);
}

// DELETE /api/dataroom?id={fileId} — remove file from disk and DB
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const file = await prisma.dataRoomFile.findUnique({ where: { id } });
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Delete from disk (best-effort)
  try {
    const fullPath = path.join(process.cwd(), file.file_path);
    await unlink(fullPath);
  } catch {
    // File may already be gone — continue with DB delete
  }

  await prisma.dataRoomFile.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
