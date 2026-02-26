// GET /api/settings/prompts  — read prompt + fund_name settings from DB
// PUT /api/settings/prompts  — upsert one or more settings

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MANAGED_KEYS = ["screening_prompt", "dd_memo_prompt", "fund_name"] as const;

// Defaults are inlined here to avoid importing @/lib/ai/client, which
// instantiates new Anthropic() at module load time and throws if
// ANTHROPIC_API_KEY is not yet set.
const DEFAULTS: Record<string, string> = {
  screening_prompt:
    `You are an investment analyst conducting a rapid, high-quality screening of a company. ` +
    `I will provide a company website URL and/or website content. Your task is to analyze ` +
    `the content to produce succinct, content-rich bullet points for each section below.\n\n` +
    `Critical Output Requirements:\n` +
    `* Maximum 3-4 bullets per section (4-5 for Product section if warranted)\n` +
    `* Each bullet must be:\n` +
    `   * Specific, factual, and content-dense\n` +
    `   * Free of filler language (no "appears to," "seems like," "leverages cutting-edge technology," "innovative solution," etc.)\n` +
    `   * Derived from actual website content\n` +
    `* No paragraphs. No marketing fluff. No generic jargon.\n` +
    `* If information is not available on the website for a section, state "Not disclosed on website"\n\n` +
    `Analysis Sections:\n` +
    `1. Business Description — what the company does, target customer, core value proposition\n` +
    `2. Problem — specific pain points addressed, why they matter\n` +
    `3. Product — what it is, key features, how it works (most detailed section)\n` +
    `4. Pricing — pricing model, specific levels if stated\n` +
    `5. Competitors — 3-5 competitors with one-line comparability reason\n` +
    `6. Customers — named customers, case studies, logos, integrations\n` +
    `7. Additional Notes — only if unusually relevant (TAM, funding, certifications, GTM insights). Omit if nothing notable.`,
  dd_memo_prompt: "",
  fund_name: "",
};

export async function GET() {
  const rows = await prisma.settings.findMany({
    where: { key: { in: [...MANAGED_KEYS] } },
  });

  const result: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) {
    result[row.key] = row.value;
  }

  return NextResponse.json(result);
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, string>;

  const updated: string[] = [];
  for (const key of MANAGED_KEYS) {
    if (typeof body[key] === "string") {
      await prisma.settings.upsert({
        where: { key },
        create: { key, value: body[key] },
        update: { value: body[key] },
      });
      updated.push(key);
    }
  }

  if (updated.length === 0) {
    return NextResponse.json({ error: "No valid keys provided" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, updated });
}
