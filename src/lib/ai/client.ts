// ─── Anthropic AI client + deal context helpers ───────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { parseDealArrays } from "@/lib/deal-utils";
import {
  fetchDocument,
  fetchDocumentByCompanyName,
  isValidOutlineDocId,
} from "@/lib/sync/lighthouse";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const AI_MODEL = "claude-sonnet-4-6";

// ─── Deal context ─────────────────────────────────────────────────────────────

export interface DealContext {
  deal: ReturnType<typeof parseDealArrays>;
  lighthouseContent: string;
  dataRoomSummaries: string[];
  transcriptSummaries: string[];
}

export async function buildDealContext(dealId: string): Promise<DealContext> {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { dataroom_files: true, transcripts: true },
  });

  const parsed = parseDealArrays(deal);

  let lighthouseContent = "";

  // Prefer fetch by company name so we use the document ID returned by search (Outline accepts that).
  // Stored outline_doc_id is often parsed from the doc URL and may not be a valid UUID/slug for the API.
  if (deal.company_name?.trim()) {
    try {
      const { content, documentId } = await fetchDocumentByCompanyName(deal.company_name);
      lighthouseContent = content;
      if (documentId && documentId !== deal.outline_doc_id) {
        prisma.deal.update({
          where: { id: deal.id },
          data: { outline_doc_id: documentId },
        }).catch(() => {}); // self-heal stored id
      }
    } catch {
      // Fall back to stored outline_doc_id only if valid (UUID or slug)
    }
  }

  if (!lighthouseContent && deal.outline_doc_id && isValidOutlineDocId(deal.outline_doc_id)) {
    try {
      const raw = await fetchDocument(deal.outline_doc_id);
      if (raw?.trim()) lighthouseContent = raw;
    } catch {
      // keep lighthouseContent empty
    }
  }

  const dataRoomSummaries = deal.dataroom_files
    .filter((f) => f.extracted_text)
    .map((f) => `[File: ${f.file_name}]\n${f.extracted_text}`);

  const transcriptSummaries = deal.transcripts
    .filter((t) => t.processed && t.summary)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((t) => `[Transcript – ${new Date(t.created_at).toLocaleDateString()}]\n${t.summary}`);

  return { deal: parsed, lighthouseContent, dataRoomSummaries, transcriptSummaries };
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.settings.findUnique({ where: { key } });
  return setting?.value ?? null;
}

export function getSystemPrompt(): string {
  return "You are an expert investment analyst at a VC fund. Produce clear, precise, actionable analysis. Avoid filler language and generic observations.";
}

// ─── Streaming helper ─────────────────────────────────────────────────────────

/**
 * Creates a streaming Response from an Anthropic stream.
 * `onComplete` is called with the full accumulated text after the stream ends —
 * useful for post-stream DB writes.
 */
export function streamResponse(
  stream: ReturnType<typeof anthropic.messages.stream>,
  onComplete?: (fullText: string) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let fullText = "";
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            const text = chunk.delta.text;
            fullText += text;
            controller.enqueue(encoder.encode(text));
          }
        }
      } finally {
        controller.close();
      }
      if (onComplete) {
        try { await onComplete(fullText); } catch { /* best-effort */ }
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// ─── Default prompts (used when Settings row is absent) ───────────────────────

export const DEFAULT_SCREENING_PROMPT = `You are an investment analyst conducting a rapid, high-quality screening of a company. I will provide a company website URL and/or website content. Your task is to analyze the content to produce succinct, content-rich bullet points for each section below.

Critical Output Requirements:
* Maximum 3-4 bullets per section (4-5 for Product section if warranted)
* Each bullet must be:
   * Specific, factual, and content-dense
   * Free of filler language (no "appears to," "seems like," "leverages cutting-edge technology," "innovative solution," etc.)
   * Derived from actual website content
* No paragraphs. No marketing fluff. No generic jargon.
* If information is not available on the website for a section, state "Not disclosed on website"

Analysis Sections:
1. Business Description — what the company does, target customer, core value proposition
2. Problem — specific pain points addressed, why they matter
3. Product — what it is, key features, how it works (most detailed section)
4. Pricing — pricing model, specific levels if stated
5. Competitors — 3-5 competitors with one-line comparability reason
6. Customers — named customers, case studies, logos, integrations
7. Additional Notes — only if unusually relevant (TAM, funding, certifications, GTM insights). Omit if nothing notable.`;

export const DEFAULT_DD_MEMO_PROMPT = `You are a senior investment analyst preparing a comprehensive due diligence investment memo. Using all provided context (deal fields, Lighthouse doc, transcripts, data room files), produce a structured memo covering:

1. **Executive Summary** — 2-3 sentences: what the company does, stage, key thesis alignment
2. **Company Overview** — founding story, team background, HQ, stage
3. **Market Opportunity** — TAM/SAM/SOM, market dynamics, why now
4. **Product & Technology** — product description, technical differentiation, roadmap
5. **Business Model** — revenue model, pricing, unit economics
6. **Traction & Metrics** — ARR, growth rate, key customer names, retention
7. **Team** — founders & key hires, relevant experience, gaps
8. **Financials** — funding history, current raise terms, cap table highlights
9. **Risks & Mitigations** — top 3-5 risks with specific mitigations
10. **Thesis Fit** — alignment with fund thesis, strategic value
11. **Recommendation** — Pass / Track / Invest with concise rationale

Use markdown formatting. Be specific and data-driven. Cite sources where relevant (e.g., "[Transcript 1]", "[Data Room]"). If information is unavailable, note it as a diligence gap.`;
