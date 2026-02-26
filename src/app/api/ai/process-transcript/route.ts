import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  anthropic,
  AI_MODEL,
  getSystemPrompt,
  streamResponse,
} from "@/lib/ai/client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { dealId, transcriptText } = body as {
    dealId?: string;
    transcriptText?: string;
  };

  if (!dealId || !transcriptText?.trim()) {
    return NextResponse.json(
      { error: "dealId and transcriptText are required" },
      { status: 400 }
    );
  }

  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Save raw transcript immediately (unprocessed) so we have an ID to update
  const transcript = await prisma.transcript.create({
    data: {
      deal_id: dealId,
      raw_text: transcriptText,
      processed: false,
    },
  });

  const systemPrompt = await getSystemPrompt();

  const userPrompt = `You are reviewing a meeting transcript with ${deal.company_name}.

Extract ONLY what was explicitly discussed. For each section below, write 3–4 concise bullet points if the topic was covered. If nothing was mentioned about a section, leave it completely empty — do not write "Not discussed" or any placeholder.

Be specific and factual. No filler language. Each bullet should convey one concrete data point or insight.

## Product
(what the product does, key features, differentiation, or roadmap items mentioned)

## Traction
(ARR, MRR, customer count, growth rate, notable customers, or usage metrics mentioned)

## Financials
(revenue, margins, burn rate, or financial performance discussed)

## Financing History
(previous rounds, investors, amounts raised, or cap table details mentioned)

## Round Dynamics
(current raise size, valuation, terms, timeline, or investor interest mentioned)

---

**Transcript:**
${transcriptText}`;

  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  return streamResponse(stream, async (summary) => {
    await prisma.transcript.update({
      where: { id: transcript.id },
      data: { processed: true, summary },
    });
    await prisma.deal.update({
      where: { id: dealId },
      data: { needs_enrichment: true },
    });
  });
}
