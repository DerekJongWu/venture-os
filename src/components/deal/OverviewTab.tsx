"use client";

import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { X, ExternalLink, RefreshCw, Upload, ChevronDown, ChevronUp, Sparkles, AlertTriangle } from "lucide-react";
import {
  ALL_STATUSES,
  FUNNEL_OPTIONS,
  FUND_OPTIONS,
  THESIS_OPTIONS,
  SOURCE_OPTIONS,
  PASS_RATIONALE_OPTIONS,
} from "@/lib/constants";
import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  deal: DealWithArrays;
  onPatchDeal: (id: string, fields: Partial<DealWithArrays>) => Promise<void>;
  onPushToAttio?: () => void;
  onSyncFromAttio?: () => void;
  pushing?: boolean;
  syncing?: boolean;
}

export function OverviewTab({
  deal,
  onPatchDeal,
  onPushToAttio,
  onSyncFromAttio,
  pushing = false,
  syncing = false,
}: Props) {
  const patch = (fields: Partial<DealWithArrays>) =>
    onPatchDeal(deal.id, fields);

  return (
    <div className="space-y-6">
      {/* Attio sync */}
      {(onPushToAttio ?? onSyncFromAttio) && (
        <section className="flex items-center gap-2">
          {onSyncFromAttio && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSyncFromAttio}
              disabled={syncing}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              Pull from Attio
            </Button>
          )}
          {onPushToAttio && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPushToAttio}
              disabled={pushing}
              className="gap-1.5"
            >
              <Upload className={`h-3.5 w-3.5 ${pushing ? "opacity-50" : ""}`} />
              Push to Attio
            </Button>
          )}
        </section>
      )}

      {/* Status & Funnel */}
      <section className="grid grid-cols-2 gap-4">
        <SingleSelect
          label="Status"
          value={deal.status ?? ""}
          options={ALL_STATUSES as unknown as string[]}
          onChange={(v) => patch({ status: v })}
        />
        <SingleSelect
          label="Funnel"
          value={deal.funnel ?? ""}
          options={FUNNEL_OPTIONS as unknown as string[]}
          onChange={(v) => patch({ funnel: v })}
        />
      </section>

      <Separator />

      {/* Fund & Source */}
      <section className="grid grid-cols-2 gap-4">
        <MultiSelect
          label="Fund"
          selected={deal.fund}
          options={FUND_OPTIONS as unknown as string[]}
          onChange={(v) => patch({ fund: v })}
        />
        <SingleSelect
          label="Source"
          value={deal.source ?? ""}
          options={SOURCE_OPTIONS as unknown as string[]}
          onChange={(v) => patch({ source: v })}
        />
      </section>

      <Separator />

      {/* Thesis */}
      <section>
        <MultiSelect
          label="Thesis"
          selected={deal.thesis}
          options={THESIS_OPTIONS as unknown as string[]}
          onChange={(v) => patch({ thesis: v })}
        />
      </section>

      <Separator />

      {/* Team */}
      <section className="space-y-4">
        <TagListField
          label="DD Lead (emails)"
          values={deal.dd_lead}
          onChange={(v) => patch({ dd_lead: v })}
          placeholder="name@fund.com"
        />
        <TagListField
          label="Deal Support (emails)"
          values={deal.deal_support}
          onChange={(v) => patch({ deal_support: v })}
          placeholder="name@fund.com"
        />
        <TextInputField
          label="Founder LinkedIn"
          value={deal.linkedin_founder ?? ""}
          onBlur={(v) => patch({ linkedin_founder: v })}
          placeholder="https://linkedin.com/in/..."
        />
      </section>

      <Separator />

      {/* Text fields */}
      <section className="space-y-4">
        <TextAreaField
          label="Description"
          value={deal.description ?? ""}
          onBlur={(v) => patch({ description: v })}
          placeholder="Brief company description..."
          rows={3}
        />
        <TextAreaField
          label="Next Steps"
          value={deal.next_steps ?? ""}
          onBlur={(v) => patch({ next_steps: v })}
          placeholder="What needs to happen next..."
          rows={2}
        />
      </section>

      <Separator />

      {/* Pass */}
      <section className="space-y-4">
        <MultiSelect
          label="Pass Rationale"
          selected={deal.pass_rationale}
          options={PASS_RATIONALE_OPTIONS as unknown as string[]}
          onChange={(v) => patch({ pass_rationale: v })}
        />
        <TextAreaField
          label="Pass Detail"
          value={deal.pass_rationale_detail ?? ""}
          onBlur={(v) => patch({ pass_rationale_detail: v })}
          placeholder="Additional pass context..."
          rows={2}
        />
      </section>

      <Separator />

      {/* Read-only & Attio sync */}
      <section className="space-y-3">
        <ReadOnlyField
          label="Lighthouse URL"
          value={deal.lighthouse_url}
          href={deal.lighthouse_url ?? undefined}
        />
        <ReadOnlyField
          label="Attio Record ID"
          value={deal.attio_record_id}
        />
        <ReadOnlyField
          label="Last Synced"
          value={
            deal.last_synced_at
              ? new Date(deal.last_synced_at).toLocaleString()
              : null
          }
        />
      </section>

      <Separator />

      {/* Analyze Deal */}
      <AnalyzeDealPanel dealId={deal.id} />
    </div>
  );
}

// ─── Field primitives ─────────────────────────────────────────────────────────

function FieldWrapper({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
        {label}
      </Label>
      {children}
    </div>
  );
}

function SingleSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <FieldWrapper label={label}>
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— none —</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldWrapper>
  );
}

function MultiSelect({
  label,
  selected,
  options,
  onChange,
}: {
  label: string;
  selected: string[];
  options: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(opt: string) {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt));
    } else {
      onChange([...selected, opt]);
    }
  }

  return (
    <FieldWrapper label={label}>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "border-gray-200 text-gray-600 hover:border-gray-400"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </FieldWrapper>
  );
}

function TagListField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && inputRef.current) {
      e.preventDefault();
      const val = inputRef.current.value.trim().replace(/,$/,"");
      if (val && !values.includes(val)) {
        onChange([...values, val]);
        inputRef.current.value = "";
      }
    }
  }

  function handleBlur() {
    if (inputRef.current?.value.trim()) {
      const val = inputRef.current.value.trim();
      if (!values.includes(val)) onChange([...values, val]);
      inputRef.current.value = "";
    }
  }

  return (
    <FieldWrapper label={label}>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 text-xs">
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="hover:text-red-500"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        ref={inputRef}
        placeholder={placeholder}
        className="h-8 text-sm"
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      <p className="text-xs text-gray-400 mt-0.5">Press Enter or comma to add</p>
    </FieldWrapper>
  );
}

function TextInputField({
  label,
  value,
  onBlur,
  placeholder,
}: {
  label: string;
  value: string;
  onBlur: (v: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);

  // Sync when deal changes
  if (local !== value && document.activeElement?.id !== `tif-${label}`) {
    setLocal(value);
  }

  return (
    <FieldWrapper label={label}>
      <Input
        id={`tif-${label}`}
        value={local}
        placeholder={placeholder}
        className="h-9 text-sm"
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onBlur(local);
        }}
      />
    </FieldWrapper>
  );
}

function TextAreaField({
  label,
  value,
  onBlur,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onBlur: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [local, setLocal] = useState(value);

  if (local !== value && document.activeElement?.tagName !== "TEXTAREA") {
    setLocal(value);
  }

  return (
    <FieldWrapper label={label}>
      <textarea
        value={local}
        rows={rows}
        placeholder={placeholder}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onBlur(local);
        }}
      />
    </FieldWrapper>
  );
}

function CurrencyField({
  label,
  value,
  onBlur,
}: {
  label: string;
  value: number | null;
  onBlur: (v: number | null) => void;
}) {
  const [local, setLocal] = useState(value?.toString() ?? "");

  return (
    <FieldWrapper label={label}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
        <Input
          value={local}
          placeholder="0"
          className="h-9 text-sm pl-6"
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            const n = parseFloat(local);
            onBlur(isNaN(n) ? null : n);
          }}
        />
      </div>
    </FieldWrapper>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <FieldWrapper label={label}>
      <div className="flex items-center gap-2 h-9">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">{checked ? "Yes" : "No"}</span>
      </div>
    </FieldWrapper>
  );
}

function ReadOnlyField({
  label,
  value,
  href,
}: {
  label: string;
  value?: string | null;
  href?: string;
}) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-gray-100 text-sm">
      <span className="text-gray-400 text-xs uppercase tracking-wide">{label}</span>
      {value ? (
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:underline text-xs max-w-[55%] truncate"
          >
            {value}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span className="text-gray-600 text-xs max-w-[55%] truncate" title={value}>
            {value}
          </span>
        )
      ) : (
        <span className="text-gray-300 text-xs">—</span>
      )}
    </div>
  );
}


// ─── Analyze Deal panel ───────────────────────────────────────────────────────

function AnalyzeDealPanel({ dealId }: { dealId: string }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    setRunning(true);
    setOutput("");
    setError(null);
    setOpen(true);
    try {
      const res = await fetch("/api/ai/analyze-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setOutput((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          onClick={handleAnalyze}
          disabled={running}
          className="gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {running ? "Analyzing…" : "Analyze Deal"}
        </Button>
        {output && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
          >
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {open ? "Collapse" : "Expand"}
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertTriangle size={12} /> {error}
        </p>
      )}
      {open && output && (
        <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-4 font-sans leading-relaxed">
          {output}
          {running && <span className="animate-pulse">▌</span>}
        </pre>
      )}
    </section>
  );
}
