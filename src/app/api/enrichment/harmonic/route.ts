import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ATTIO_BASE, attioHeaders } from "@/lib/attio";
import { enrichCompany } from "@/lib/enrichment/harmonic";

// Fetch the primary domain for a company from Attio
async function getDomainFromAttio(attio_record_id: string): Promise<string | null> {
  if (!process.env.ATTIO_API_KEY) return null;
  try {
    const res = await fetch(
      `${ATTIO_BASE}/objects/companies/records/${attio_record_id}`,
      { headers: attioHeaders() }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Attio stores domains as an array of { domain: string } objects
    const domains: Array<{ domain?: string }> =
      data?.data?.values?.domains ?? [];
    return domains[0]?.domain ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { dealId } = await req.json().catch(() => ({}));
  if (!dealId) {
    return NextResponse.json({ error: "dealId required" }, { status: 400 });
  }

  if (!process.env.HARMONIC_API_KEY) {
    return NextResponse.json(
      { error: "HARMONIC_API_KEY not configured" },
      { status: 503 }
    );
  }

  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Resolve identifier: prefer domain from Attio, fall back to company name
  let identifier = deal.company_name;
  let identifierType: "domain" | "name" = "name";

  if (deal.attio_record_id) {
    const domain = await getDomainFromAttio(deal.attio_record_id);
    if (domain) {
      identifier = domain;
      identifierType = "domain";
    }
  }

  try {
    const result = await enrichCompany(identifier, identifierType, dealId);
    return NextResponse.json({
      ok: true,
      harmonic_id: result.harmonic_id,
      employee_count: result.employee_count,
      total_funding: result.total_funding,
      last_funding_stage: result.last_funding_stage,
      last_funding_date: result.last_funding_date,
      headcount_growth_6m: result.headcount_growth_6m,
      harmonic_competitors: result.harmonic_competitors,
      harmonic_investors: result.harmonic_investors,
      harmonic_enriched_at: result.harmonic_enriched_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enrichment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
