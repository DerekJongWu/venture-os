import type { Deal } from "@/generated/prisma/client";

// SQLite stores array fields as JSON strings.
// These helpers parse them back to string[].

export function parseDealArrays(deal: Deal) {
  return {
    ...deal,
    fund: parseJsonArray(deal.fund),
    dd_lead: parseJsonArray(deal.dd_lead),
    deal_support: parseJsonArray(deal.deal_support),
    thesis: parseJsonArray(deal.thesis),
    pass_rationale: parseJsonArray(deal.pass_rationale),
  };
}

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeJsonArray(value: string[]): string {
  return JSON.stringify(value);
}

// Type with arrays properly typed as string[]
export type DealWithArrays = Omit<
  Deal,
  "fund" | "dd_lead" | "deal_support" | "thesis" | "pass_rationale"
> & {
  fund: string[];
  dd_lead: string[];
  deal_support: string[];
  thesis: string[];
  pass_rationale: string[];
};
