"use client";

import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  deal: DealWithArrays;
}

export function HarmonicTab({ deal }: Props) {
  const hasData =
    deal.employee_count != null ||
    deal.total_funding != null ||
    deal.last_funding_stage != null;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-gray-500">
          No enrichment data yet — coming in Phase 7
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Row label="Employees" value={deal.employee_count?.toLocaleString()} />
      <Row
        label="Total Funding"
        value={
          deal.total_funding != null
            ? `$${(deal.total_funding / 1e6).toFixed(1)}M`
            : undefined
        }
      />
      <Row label="Last Stage" value={deal.last_funding_stage} />
      <Row
        label="Last Funding"
        value={
          deal.last_funding_date
            ? new Date(deal.last_funding_date).toLocaleDateString()
            : undefined
        }
      />
      <Row
        label="6m Headcount Growth"
        value={
          deal.headcount_growth_6m != null
            ? `${(deal.headcount_growth_6m * 100).toFixed(1)}%`
            : undefined
        }
      />
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value ?? "—"}</span>
    </div>
  );
}
