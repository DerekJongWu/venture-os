import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  anthropic,
  AI_MODEL,
  buildDealContext,
  getSetting,
  getSystemPrompt,
  streamResponse,
  DEFAULT_SCREENING_PROMPT,
} from "@/lib/ai/client";

/** Very light HTML → plain text: strip tags, collapse whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20000); // cap at 20k chars to stay within context
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { dealId, url } = body as { dealId?: string; url?: string };

  if (!dealId) {
    return NextResponse.json({ error: "dealId required" }, { status: 400 });
  }

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, company_name: true },
  });
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const targetUrl = url?.trim();
  if (!targetUrl) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  // Fetch website content server-side
  let websiteContent = "";
  try {
    const r = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DealFlowBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) {
      const html = await r.text();
      websiteContent = htmlToText(html);
    }
  } catch {
    websiteContent = "(Could not fetch website — proceeding with available context only)";
  }

  // Build deal context: fetches live Lighthouse doc + data room summaries
  const ctx = await buildDealContext(dealId);

  const screeningPrompt = (await getSetting("screening_prompt")) ?? DEFAULT_SCREENING_PROMPT;
  const systemPrompt = await getSystemPrompt();

  const userPrompt = `You are filling in the Lighthouse deal note for ${deal.company_name}.

You have:
1. The current Lighthouse document (with its existing section structure)
2. Website content from ${targetUrl}
3. Data room file extracts (if any)

Your task: Produce an updated version of the Lighthouse document that:
- Preserves the existing sections and their order
- Fills in each section with specific, factual bullet points drawn from the website and data room
- Adds new sections only if the materials contain important information not covered by the existing structure
- Uses clear, concise bullet points throughout — no prose paragraphs
- Leads each bullet with the most important word or phrase, followed by supporting detail

Research and analysis guidelines:
${screeningPrompt}

Do NOT add a preamble like "Here is the updated document". Output only the document content.

---

## Current Lighthouse Document
${ctx.lighthouseContent || "(empty — create a well-structured document from scratch)"}

---

## Website Content (${targetUrl})
${websiteContent || "(not available)"}

${ctx.dataRoomSummaries.length > 0 ? `---\n\n## Data Room Materials\n${ctx.dataRoomSummaries.join("\n\n")}` : ""}`;

  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  return streamResponse(stream);
}
