// ─── Harmonic company enrichment ──────────────────────────────────────────────
//
// Harmonic API: https://api.harmonic.ai
// Auth header : { apikey: HARMONIC_API_KEY }
//
// Key endpoints (discovered from OpenAPI spec):
//   POST /companies?website_url=https://{domain}  → single company object
//   GET  /companies?urns={urn}&urns={urn}...       → array of company objects
//   GET  /search/similar_companies/{urn}           → { results: [urns...] }
//   GET  /search/typeahead?query={name}&search_type=COMPANY → name lookup

import { prisma } from "@/lib/prisma";

const HARMONIC_BASE = "https://api.harmonic.ai";

// ─── Harmonic response types ───────────────────────────────────────────────────

interface HarmonicInvestorRaw {
  entity_urn?: string;
  name?: string;
}

interface HarmonicFunding {
  funding_total?: number | null;
  last_funding_at?: string | null;
  last_funding_type?: string | null;
  funding_stage?: string | null;
  investors?: HarmonicInvestorRaw[] | null;
}

interface HarmonicTractionWindow {
  value?: number | null;
  change?: number | null;
  percent_change?: number | null;
}

interface HarmonicHeadcountMetric {
  "180d_ago"?: HarmonicTractionWindow;
  [key: string]: HarmonicTractionWindow | undefined;
}

interface HarmonicTractionMetrics {
  headcount?: HarmonicHeadcountMetric;
}

interface HarmonicCompany {
  entity_urn?: string;
  id?: number | string;
  name?: string;
  headcount?: number | null;
  funding?: HarmonicFunding | null;
  traction_metrics?: HarmonicTractionMetrics | null;
  website?: { domain?: string | null } | null;
}

interface HarmonicTypeaheadResult {
  entity_urn?: string;
  text?: string;
}

export interface HarmonicCompetitor {
  id: string;
  name: string;
  domain: string | null;
}

export interface HarmonicInvestor {
  id: string;  // entity_urn
  name: string;
}

export interface EnrichmentResult {
  harmonic_id: string | null;
  employee_count: number | null;
  total_funding: number | null;
  last_funding_stage: string | null;
  last_funding_date: Date | null;
  headcount_growth_6m: number | null;
  harmonic_competitors: HarmonicCompetitor[];
  harmonic_investors: HarmonicInvestor[];
  harmonic_enriched_at: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function harmonicHeaders() {
  return {
    apikey: process.env.HARMONIC_API_KEY ?? "",
    "Content-Type": "application/json",
  };
}

/** POST /companies?website_url=https://{domain} → single company object */
async function lookupByWebsiteUrl(domain: string): Promise<HarmonicCompany | null> {
  const url = `${HARMONIC_BASE}/companies?website_url=https://${domain}`;
  const res = await fetch(url, { method: "POST", headers: harmonicHeaders() });
  if (!res.ok) throw new Error(`Harmonic lookup failed: HTTP ${res.status}`);
  const data = await res.json();
  // Returns the company object directly (not wrapped in array/results)
  if (data && typeof data === "object" && !Array.isArray(data) && data.entity_urn) {
    return data as HarmonicCompany;
  }
  return null;
}

/** GET /search/typeahead?query={name}&search_type=COMPANY → first URN */
async function lookupUrnByName(name: string): Promise<string | null> {
  const url = `${HARMONIC_BASE}/search/typeahead?query=${encodeURIComponent(name)}&search_type=COMPANY&size=1`;
  const res = await fetch(url, { headers: harmonicHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  const results: HarmonicTypeaheadResult[] = data?.results ?? [];
  return results[0]?.entity_urn ?? null;
}

/** GET /companies?urns={urn1}&urns={urn2}... → array of company objects */
async function batchGetByUrns(urns: string[]): Promise<HarmonicCompany[]> {
  if (urns.length === 0) return [];
  const q = urns.map((u) => `urns=${encodeURIComponent(u)}`).join("&");
  const res = await fetch(`${HARMONIC_BASE}/companies?${q}`, { headers: harmonicHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? (data as HarmonicCompany[]) : [];
}

/** GET /search/similar_companies/{urn} → top-5 similar company objects */
async function fetchSimilarCompanies(urn: string): Promise<HarmonicCompetitor[]> {
  const res = await fetch(`${HARMONIC_BASE}/search/similar_companies/${encodeURIComponent(urn)}`, {
    headers: harmonicHeaders(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const urns: string[] = (data?.results ?? []).slice(0, 5);
  if (urns.length === 0) return [];

  const companies = await batchGetByUrns(urns);
  return companies
    .filter((c) => c.entity_urn && c.name)
    .map((c) => ({
      id: c.entity_urn!,
      name: c.name!,
      domain: c.website?.domain ?? null,
    }));
}

/** Map a raw Harmonic company object to our EnrichmentResult shape. */
function mapCompany(company: HarmonicCompany, competitors: HarmonicCompetitor[]): EnrichmentResult {
  const lastFundingDate = company.funding?.last_funding_at
    ? (() => {
        const d = new Date(company.funding!.last_funding_at!);
        return isNaN(d.getTime()) ? null : d;
      })()
    : null;

  // Harmonic returns percent_change as a raw % (e.g. 25.93 = 25.93%).
  // We store as a decimal (0.2593) so the UI can multiply by 100 to display.
  const rawPctChange = company.traction_metrics?.headcount?.["180d_ago"]?.percent_change;
  const headcount_growth_6m = rawPctChange != null ? rawPctChange / 100 : null;

  // Prefer last_funding_type over funding_stage (more specific)
  const stage = company.funding?.last_funding_type ?? company.funding?.funding_stage ?? null;

  const investors: HarmonicInvestor[] = (company.funding?.investors ?? [])
    .filter((inv) => inv.entity_urn && inv.name)
    .map((inv) => ({ id: inv.entity_urn!, name: inv.name! }));

  return {
    harmonic_id: company.entity_urn ?? (company.id ? String(company.id) : null),
    employee_count: company.headcount ?? null,
    total_funding: company.funding?.funding_total ?? null,
    last_funding_stage: stage,
    last_funding_date: lastFundingDate,
    headcount_growth_6m,
    harmonic_competitors: competitors,
    harmonic_investors: investors,
    harmonic_enriched_at: new Date(),
  };
}

// ─── enrichCompany ────────────────────────────────────────────────────────────

export async function enrichCompany(
  identifier: string,
  identifierType: "domain" | "name",
  dealId: string
): Promise<EnrichmentResult> {
  if (!process.env.HARMONIC_API_KEY) {
    throw new Error("HARMONIC_API_KEY not configured");
  }

  let company: HarmonicCompany | null = null;

  if (identifierType === "domain") {
    company = await lookupByWebsiteUrl(identifier);
  } else {
    // Name lookup: typeahead → get URN → batch-fetch full record
    const urn = await lookupUrnByName(identifier);
    if (urn) {
      const results = await batchGetByUrns([urn]);
      company = results[0] ?? null;
    }
  }

  if (!company) {
    await prisma.syncLog.create({
      data: {
        entity_type: "deal",
        entity_id: dealId,
        direction: "pull",
        source: "harmonic",
        status: "error",
        error: `Company not found on Harmonic for ${identifierType}: ${identifier}`,
      },
    });
    throw new Error(`Company not found on Harmonic for ${identifierType}: ${identifier}`);
  }

  // Fetch similar companies if we have a URN
  const competitors = company.entity_urn
    ? await fetchSimilarCompanies(company.entity_urn)
    : [];

  const result = mapCompany(company, competitors);

  // Persist to DB
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      harmonic_id: result.harmonic_id,
      employee_count: result.employee_count,
      total_funding: result.total_funding,
      last_funding_stage: result.last_funding_stage,
      last_funding_date: result.last_funding_date,
      headcount_growth_6m: result.headcount_growth_6m,
      harmonic_competitors: JSON.stringify(result.harmonic_competitors),
      harmonic_investors: JSON.stringify(result.harmonic_investors),
      harmonic_enriched_at: result.harmonic_enriched_at,
    },
  });

  await prisma.syncLog.create({
    data: {
      entity_type: "deal",
      entity_id: dealId,
      direction: "pull",
      source: "harmonic",
      status: "success",
    },
  });

  return result;
}
