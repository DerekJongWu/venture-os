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

  const userPrompt = `You are enriching an existing deal note with information from meeting transcripts. The note already has a fixed template structure. Your output must preserve that structure exactly and only add or rephrase bullets inside it.

CRITICAL — PRESERVE STRUCTURE:
- The document in <document> is the single source of truth for structure. It typically has: company info at the top (name, Company link, Owner(s), Thesis Statement, Socials, HQ, Founded, etc.), then sections under ### headings (e.g. ### Team, ### Business Description, ### Problem, ### Product, ### Market dynamics, ### GTM strategy, ### Business model/pricing, ### Customers and early traction, ### Financing history).
- Your output MUST contain every heading, every line of the top company block, and every ### section that appears in <document>, in the exact same order. Copy any section verbatim if the transcript has nothing to add; do not drop, rename, or reorder sections.
- Do NOT introduce new section headings that are not in <document>. The labels in <transcripts> like [Product] and [Traction] are only categories — map that content into the document's existing sections by topic (e.g. [Traction] into ### Customers and early traction or ### Business Description), and do not output those labels as headings.

YOUR ONLY CHANGES:
- Top block: Keep the same layout and fields. You may fill in or rephrase placeholder bullets (e.g. Thesis Statement) using transcript info; leave empty fields and structure unchanged.
- Under each ### section: Only add new bullet points and/or rephrase existing bullets using transcript information. Keep bullet format ("- " or "* "). Do not remove bullets, turn sections into paragraphs, or replace a section with different structure.
- If a section has no relevant transcript content, output it exactly as in <document>.

OUTPUT FORMAT:
- Output only the full revised markdown document. No preamble, no explanation, no \`\`\` fences, no XML tags. Start with the document content (e.g. company name at top) and end with the last section.

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
