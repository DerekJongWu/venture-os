import { NextRequest, NextResponse } from "next/server";
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

  const ctx = await buildDealContext(dealId);
  const systemPrompt = await getSystemPrompt();
  const deal = ctx.deal;

  const userPrompt = `Analyze this deal and provide a rapid diligence assessment for ${deal.company_name}.

## Deal Summary
- Status: ${deal.status ?? "—"}
- Funnel: ${deal.funnel ?? "—"}
- Thesis: ${deal.thesis.join(", ") || "—"}
- Description: ${deal.description ?? "—"}
- Next Steps: ${deal.next_steps ?? "—"}
${deal.employee_count ? `- Employees: ${deal.employee_count.toLocaleString()}` : ""}
${deal.total_funding ? `- Total Funding: $${(deal.total_funding / 1e6).toFixed(1)}M` : ""}

${ctx.lighthouseContent ? `## Lighthouse Notes\n${ctx.lighthouseContent}` : ""}
${ctx.transcriptSummaries.length > 0 ? `\n## Meeting Notes\n${ctx.transcriptSummaries.join("\n\n")}` : ""}
${ctx.dataRoomSummaries.length > 0 ? `\n## Data Room\n${ctx.dataRoomSummaries.join("\n\n")}` : ""}

---

Produce the following analysis:

## Information Gaps
List specific missing data points needed to make an investment decision (e.g., "No ARR figures disclosed", "Founding team backgrounds unclear").

## Red Flags
List concrete concerns or risks based on available information. Be specific — cite what you observed, not generic risks.

## Green Flags
Notable positive signals and competitive advantages. Be specific.

## Thesis Alignment Score
Score from 1–10 with 2-3 sentence rationale explaining alignment with the fund's investment thesis.

## Recommended Next Steps
2-3 specific, actionable diligence steps to address the highest-priority gaps.`;

  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  return streamResponse(stream);
}
