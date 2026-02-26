import { NextRequest, NextResponse } from "next/server";
import {
  anthropic,
  AI_MODEL,
  buildDealContext,
  getSetting,
  getSystemPrompt,
  streamResponse,
  DEFAULT_DD_MEMO_PROMPT,
} from "@/lib/ai/client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { dealId } = body as { dealId?: string };

  if (!dealId) {
    return NextResponse.json({ error: "dealId required" }, { status: 400 });
  }

  const ctx = await buildDealContext(dealId);
  const systemPrompt = await getSystemPrompt();
  const ddMemoPrompt = (await getSetting("dd_memo_prompt")) ?? DEFAULT_DD_MEMO_PROMPT;

  const deal = ctx.deal;

  const userPrompt = `Generate a due diligence investment memo for ${deal.company_name}.

## Deal Fields
- Status: ${deal.status ?? "—"}
- Funnel: ${deal.funnel ?? "—"}
- Fund: ${deal.fund.join(", ") || "—"}
- Thesis: ${deal.thesis.join(", ") || "—"}
- Source: ${deal.source ?? "—"}
- DD Lead: ${deal.dd_lead.join(", ") || "—"}
- Description: ${deal.description ?? "—"}
- Next Steps: ${deal.next_steps ?? "—"}
${deal.employee_count ? `- Employees: ${deal.employee_count.toLocaleString()}` : ""}
${deal.total_funding ? `- Total Funding: $${(deal.total_funding / 1e6).toFixed(1)}M` : ""}
${deal.last_funding_stage ? `- Last Round: ${deal.last_funding_stage}` : ""}

${ctx.lighthouseContent ? `## Lighthouse Document\n${ctx.lighthouseContent}` : ""}

${ctx.transcriptSummaries.length > 0 ? `## Transcript Summaries\n${ctx.transcriptSummaries.join("\n\n---\n\n")}` : ""}

${ctx.dataRoomSummaries.length > 0 ? `## Data Room Files\n${ctx.dataRoomSummaries.join("\n\n")}` : ""}

---

${ddMemoPrompt}`;

  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Do NOT save or push to Lighthouse — ephemeral, display only
  return streamResponse(stream);
}
