"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, ChevronsUpDown, X } from "lucide-react";
import {
  STATUS_COLORS,
  SWIM_LANES,
  FUNNEL_OPTIONS,
  FUND_OPTIONS,
  THESIS_OPTIONS,
} from "@/lib/constants";
import type { DealWithArrays } from "@/lib/deal-utils";

type SortField =
  | "company_name"
  | "status"
  | "funnel"
  | "source"
  | "last_synced_at";
type SortDir = "asc" | "desc";

interface Filters {
  status: string;
  funnel: string;
  fund: string;
  thesis: string;
  dd_lead: string;
}

const EMPTY_FILTERS: Filters = {
  status: "",
  funnel: "",
  fund: "",
  thesis: "",
  dd_lead: "",
};

interface Props {
  deals: DealWithArrays[];
  onSelectDeal: (id: string) => void;
}

export function TableView({ deals, onSelectDeal }: Props) {
  const [sortField, setSortField] = useState<SortField>("last_synced_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field)
      return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  }

  const allDdLeads = useMemo(() => {
    const set = new Set<string>();
    deals.forEach((d) => d.dd_lead.forEach((e) => set.add(e)));
    return Array.from(set).sort();
  }, [deals]);

  const filtered = useMemo(() => {
    return deals.filter((d) => {
      if (filters.status && d.status !== filters.status) return false;
      if (filters.funnel && d.funnel !== filters.funnel) return false;
      if (filters.fund && !d.fund.includes(filters.fund)) return false;
      if (filters.thesis && !d.thesis.includes(filters.thesis)) return false;
      if (filters.dd_lead && !d.dd_lead.includes(filters.dd_lead)) return false;
      return true;
    });
  }, [deals, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortField === "last_synced_at") {
        const av = a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0;
        const bv = b.last_synced_at ? new Date(b.last_synced_at).getTime() : 0;
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const av = (a[sortField] ?? "") as string;
      const bv = (b[sortField] ?? "") as string;
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortField, sortDir]);

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="flex flex-col h-full">
      {/* filter bar */}
      <div className="flex items-center gap-2 px-6 py-3 bg-white border-b border-gray-200 flex-wrap">
        <span className="text-xs font-medium text-gray-500 mr-1">Filter:</span>

        {/* Status grouped by swim lane */}
        <Select
          value={filters.status || "__all__"}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, status: v === "__all__" ? "" : v }))
          }
        >
          <SelectTrigger className="h-8 text-xs w-auto min-w-[120px] max-w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Status (all)</SelectItem>
            {SWIM_LANES.map((lane, li) => (
              <div key={lane.id}>
                {li > 0 && <SelectSeparator />}
                <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide pointer-events-none">
                  {lane.label}
                </div>
                {lane.statuses.map((s) => (
                  <SelectItem key={s} value={s} className="pl-4 text-xs">
                    {s}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>

        <FilterSelect
          placeholder="Funnel"
          value={filters.funnel}
          onChange={(v) => setFilters((f) => ({ ...f, funnel: v }))}
          options={FUNNEL_OPTIONS as unknown as string[]}
        />
        <FilterSelect
          placeholder="Fund"
          value={filters.fund}
          onChange={(v) => setFilters((f) => ({ ...f, fund: v }))}
          options={FUND_OPTIONS as unknown as string[]}
        />
        <FilterSelect
          placeholder="Thesis"
          value={filters.thesis}
          onChange={(v) => setFilters((f) => ({ ...f, thesis: v }))}
          options={THESIS_OPTIONS as unknown as string[]}
        />
        <FilterSelect
          placeholder="DD Lead"
          value={filters.dd_lead}
          onChange={(v) => setFilters((f) => ({ ...f, dd_lead: v }))}
          options={allDdLeads}
        />

        {hasFilters && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1"
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {sorted.length} results
        </span>
      </div>

      {/* table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <SortableHead
                field="company_name"
                label="Company"
                toggle={toggleSort}
                Icon={SortIcon}
              />
              <SortableHead
                field="status"
                label="Status"
                toggle={toggleSort}
                Icon={SortIcon}
              />
              <SortableHead
                field="funnel"
                label="Funnel"
                toggle={toggleSort}
                Icon={SortIcon}
              />
              <TableHead className="text-xs font-medium text-gray-600">
                Fund
              </TableHead>
              <TableHead className="text-xs font-medium text-gray-600">
                DD Lead
              </TableHead>
              <TableHead className="text-xs font-medium text-gray-600">
                Thesis
              </TableHead>
              <SortableHead
                field="source"
                label="Source"
                toggle={toggleSort}
                Icon={SortIcon}
              />
              <TableHead className="text-xs font-medium text-gray-600">
                Sourced
              </TableHead>
              <SortableHead
                field="last_synced_at"
                label="Last Synced"
                toggle={toggleSort}
                Icon={SortIcon}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((deal) => (
              <TableRow
                key={deal.id}
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => onSelectDeal(deal.id)}
              >
                <TableCell className="font-medium text-sm text-gray-900">
                  {deal.company_name}
                  {deal.missing_in_attio && (
                    <span className="ml-2 text-xs text-amber-600 font-normal">
                      (missing in Attio)
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {deal.status && (
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        STATUS_COLORS[deal.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {deal.status}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {deal.funnel ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {deal.fund.map((f) => (
                      <Badge key={f} variant="outline" className="text-xs py-0">
                        {f}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-gray-600">
                  {deal.dd_lead.map((e) => e.split("@")[0]).join(", ") || "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {deal.thesis.slice(0, 2).map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="text-xs py-0 px-1.5"
                      >
                        {t}
                      </Badge>
                    ))}
                    {deal.thesis.length > 2 && (
                      <Badge
                        variant="secondary"
                        className="text-xs py-0 px-1.5"
                      >
                        +{deal.thesis.length - 2}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {deal.source ?? "—"}
                </TableCell>
                <TableCell>
                  <span
                    className={`text-xs font-medium ${
                      deal.sourced ? "text-green-700" : "text-gray-400"
                    }`}
                  >
                    {deal.sourced ? "Yes" : "No"}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-gray-400 whitespace-nowrap">
                  {deal.last_synced_at
                    ? new Date(deal.last_synced_at).toLocaleDateString()
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-sm text-gray-400 py-12"
                >
                  No deals match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function FilterSelect({
  placeholder,
  value,
  onChange,
  options,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <Select
      value={value || "__all__"}
      onValueChange={(v) => onChange(v === "__all__" ? "" : v)}
    >
      <SelectTrigger className="h-8 text-xs w-auto min-w-[110px] max-w-[180px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{placeholder} (all)</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SortableHead({
  field,
  label,
  toggle,
  Icon,
}: {
  field: SortField;
  label: string;
  toggle: (f: SortField) => void;
  Icon: React.ComponentType<{ field: SortField }>;
}) {
  return (
    <TableHead
      className="text-xs font-medium text-gray-600 cursor-pointer select-none"
      onClick={() => toggle(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <Icon field={field} />
      </div>
    </TableHead>
  );
}
