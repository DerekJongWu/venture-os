import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDealArrays } from "@/lib/deal-utils";

export async function GET() {
  const deals = await prisma.deal.findMany({
    orderBy: { updated_at: "desc" },
    include: {
      notes: { orderBy: { created_at: "desc" }, take: 5 },
      transcripts: { orderBy: { created_at: "desc" }, take: 5 },
      dataroom_files: { orderBy: { uploaded_at: "desc" } },
    },
  });
  return NextResponse.json(deals.map(parseDealArrays));
}
