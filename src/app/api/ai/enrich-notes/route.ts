import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  anthropic,
  AI_MODEL,
  buildDealContext,
  getSystemPrompt,
  streamResponse,
} from "@/lib/ai/client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { dealId } = body as { dealId?: string };

  if (!dealId) {
    return NextResponse.json({ error: "dealId required" }, { status: 400 });
  }

  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (!deal.outline_doc_id) {
    return NextResponse.json(
      { error: "No Lighthouse doc linked to this deal" },
      { status: 422 }
    );
  }

  const ctx = await buildDealContext(dealId);

  if (!ctx.lighthouseContent?.trim()) {
    return NextResponse.json(
      { error: "Lighthouse note content could not be retrieved. Open the Notes tab to confirm the note loads, then try again." },
      { status: 422 }
    );
  }

  const systemPrompt = getSystemPrompt();

  // Strip markdown headings from transcript summaries so they can't be
  // mistaken for document section structure by the model.
  function flattenTranscript(raw: string): string {
    return raw.replace(/^#{1,6}\s+(.+)$/gm, "[$1]");
  }

  const transcriptBlock =
    ctx.transcriptSummaries.length > 0
      ? ctx.transcriptSummaries.map(flattenTranscript).join("\n\n---\n\n")
      : "No processed transcripts available.";

  const userPrompt = `You are editing an existing deal note. The note is in <document> tags below.

Your job: return an updated version of that exact document with relevant facts from the meeting transcripts woven in. The document's section structure is the ground truth — do not change it.

RULES:
1. Output only the revised document. No preamble, no explanation, no XML tags.
2. Every section heading in <document> must appear in your output, in the same order. Do not rename, add, or remove sections.
3. Within each section, update or add bullet points using information from the transcripts. If a section has nothing new, copy it unchanged.
4. The labels in <transcripts> like [Product] and [Traction] are data categories extracted from the meeting — they are not section headings and must NOT appear in your output.
5. Append a new section at the end only if the transcript contains important information with no corresponding section in the document.

<document>
${ctx.lighthouseContent}
</document>

<transcripts>
${transcriptBlock}
</transcripts>

${ctx.dataRoomSummaries.length > 0 ? `<dataroom>\n${ctx.dataRoomSummaries.join("\n\n")}\n</dataroom>` : ""}`;

  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  return streamResponse(stream, async () => {
    await prisma.deal.update({
      where: { id: dealId },
      data: { needs_enrichment: false },
    });
  });
}
