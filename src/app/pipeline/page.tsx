import { prisma } from "@/lib/prisma";
import { parseDealArrays } from "@/lib/deal-utils";
import { PipelineClient } from "@/components/pipeline/PipelineClient";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const raw = await prisma.deal.findMany({
    orderBy: { updated_at: "desc" },
    include: {
      notes: { orderBy: { created_at: "desc" }, take: 5 },
      transcripts: { orderBy: { created_at: "desc" }, take: 5 },
      dataroom_files: { orderBy: { uploaded_at: "desc" } },
    },
  });

  const deals = raw.map(parseDealArrays);

  return <PipelineClient initialDeals={deals} />;
}
