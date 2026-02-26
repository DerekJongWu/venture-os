"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DealWithArrays } from "@/lib/deal-utils";
import type { HarmonicCompetitor, HarmonicInvestor } from "@/lib/enrichment/harmonic";

interface Props {
  deal: DealWithArrays;
}

// ─── Local state ───────────────────────────────────────────────────────────────

interface EnrichmentState {
  employee_count: number | null;
  total_funding: number | null;
  last_funding_stage: string | null;
  last_funding_date: Date | null;
  headcount_growth_6m: number | null;
  harmonic_competitors: HarmonicCompetitor[];
  harmonic_investors: HarmonicInvestor[];
  harmonic_enriched_at: Date | null;
  harmonic_id: string | null;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function dealToState(deal: DealWithArrays): EnrichmentState {
  const d = deal as unknown as Record<string, string | null>;
  return {
    employee_count: deal.employee_count ?? null,
    total_funding: deal.total_funding ?? null,
    last_funding_stage: deal.last_funding_stage ?? null,
    last_funding_date: deal.last_funding_date ? new Date(deal.last_funding_date) : null,
    headcount_growth_6m: deal.headcount_growth_6m ?? null,
    harmonic_competitors: parseJson<HarmonicCompetitor[]>(d.harmonic_competitors, []),
    harmonic_investors: parseJson<HarmonicInvestor[]>(d.harmonic_investors, []),
    harmonic_enriched_at: deal.harmonic_enriched_at ? new Date(deal.harmonic_enriched_at) : null,
    harmonic_id: deal.harmonic_id ?? null,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatFunding(amount: number | null): string {
  if (amount == null) return "—";
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatEnrichedAt(d: Date | null): string {
  if (!d) return "Never";
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// Extract numeric ID from URN (e.g. "urn:harmonic:company:14449067" → "14449067")
function harmonicUrl(urn: string): string {
  const id = urn.split(":").pop() ?? urn;
  return `https://console.harmonic.ai/dashboard/company/${id}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-gray-100 text-sm">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-gray-900 text-right ml-4">{children}</span>
    </div>
  );
}

function HeadcountGrowth({ growth }: { growth: number | null }) {
  if (growth == null) return <span>—</span>;
  const pct = (growth * 100).toFixed(1);
  if (growth > 0) {
    return (
      <span className="flex items-center gap-1 text-green-600">
        <TrendingUp size={14} />+{pct}%
      </span>
    );
  }
  if (growth < 0) {
    return (
      <span className="flex items-center gap-1 text-red-500">
        <TrendingDown size={14} />{pct}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-gray-400">
      <Minus size={14} />0.0%
    </span>
  );
}

function CompanyRow({ id, name, subtitle }: { id: string; name: string; subtitle?: string | null }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
      <span className="text-gray-900">{name}</span>
      <div className="flex items-center gap-3 text-gray-400 text-xs">
        {subtitle && <span>{subtitle}</span>}
        <a
          href={harmonicUrl(id)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-700 flex items-center"
        >
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HarmonicTab({ deal }: Props) {
  const [data, setData] = useState<EnrichmentState>(() => dealToState(deal));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasData = data.harmonic_enriched_at != null;

  async function handleEnrich() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/enrichment/harmonic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: deal.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Enrichment failed (HTTP ${res.status})`);
        return;
      }
      setData({
        employee_count: json.employee_count ?? null,
        total_funding: json.total_funding ?? null,
        last_funding_stage: json.last_funding_stage ?? null,
        last_funding_date: json.last_funding_date ? new Date(json.last_funding_date) : null,
        headcount_growth_6m: json.headcount_growth_6m ?? null,
        harmonic_competitors: json.harmonic_competitors ?? [],
        harmonic_investors: json.harmonic_investors ?? [],
        harmonic_enriched_at: json.harmonic_enriched_at ? new Date(json.harmonic_enriched_at) : new Date(),
        harmonic_id: json.harmonic_id ?? null,
      });
    } catch {
      setError("Network error — could not reach enrichment API.");
    } finally {
      setLoading(false);
    }
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <p className="text-sm text-gray-500">No enrichment data yet.</p>
        {error && <p className="text-sm text-red-500 max-w-xs">{error}</p>}
        <Button size="sm" onClick={handleEnrich} disabled={loading}>
          {loading
            ? <><RefreshCw size={14} className="mr-1.5 animate-spin" />Enriching…</>
            : "Enrich Now"}
        </Button>
      </div>
    );
  }

  // ── Enriched state ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Metrics ───────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Company Metrics
        </h3>
        <div>
          <Row label="Employee Count">
            <span>{data.employee_count?.toLocaleString() ?? "—"}</span>
          </Row>
          <Row label="6-Month Headcount Growth">
            <HeadcountGrowth growth={data.headcount_growth_6m} />
          </Row>
          <Row label="Total Funding Raised">
            {formatFunding(data.total_funding)}
          </Row>
          <Row label="Last Funding Round">
            {data.last_funding_stage ?? "—"}
            {data.last_funding_date && (
              <span className="text-gray-400 font-normal ml-1.5">
                ({formatDate(data.last_funding_date)})
              </span>
            )}
          </Row>
        </div>
      </div>

      {/* ── Investors ─────────────────────────────────────────────────────── */}
      {data.harmonic_investors.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Investors
          </h3>
          <div>
            {data.harmonic_investors.map((inv) => (
              <CompanyRow key={inv.id} id={inv.id} name={inv.name} />
            ))}
          </div>
        </div>
      )}

      {/* ── Similar Companies ─────────────────────────────────────────────── */}
      {data.harmonic_competitors.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Similar Companies
          </h3>
          <div>
            {data.harmonic_competitors.map((c) => (
              <CompanyRow key={c.id} id={c.id} name={c.name} subtitle={c.domain} />
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-gray-400">
          Last enriched: {formatEnrichedAt(data.harmonic_enriched_at)}
        </p>
        <div className="flex flex-col items-end gap-1">
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button size="sm" variant="outline" onClick={handleEnrich} disabled={loading}>
            {loading
              ? <><RefreshCw size={13} className="mr-1.5 animate-spin" />Re-enriching…</>
              : <><RefreshCw size={13} className="mr-1.5" />Re-enrich</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
