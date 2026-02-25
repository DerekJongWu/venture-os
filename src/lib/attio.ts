// ─── Attio API v2 client utilities ────────────────────────────────────────────

export const ATTIO_BASE = "https://api.attio.com/v2";
export const PIPELINE_LIST_ID = "1386c3a1-4ebe-4cec-96bb-43a7619e145b";

export function attioHeaders() {
  return {
    Authorization: `Bearer ${process.env.ATTIO_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ─── Response types ────────────────────────────────────────────────────────────

export interface AttioCompanyRecord {
  id: { workspace_id: string; object_slug: string; record_id: string };
  values: Record<string, AttioValue[]>;
}

export interface AttioListEntry {
  id: { entry_id: string; list_id: string };
  parent_record_id: string; // plain UUID string in the actual API response
  parent_object: string;    // e.g. "companies"
  entry_values: Record<string, AttioValue[]>;
}

export interface AttioValue {
  attribute_type?: string;
  value?: unknown;
  checked?: boolean;
  currency_value?: number;
  // attribute_type "status" (e.g. status_3, funnel)
  status?: { id: Record<string, string>; title: string };
  // attribute_type "select" (e.g. fund_5, thesis, source_7, pass_rationale_7)
  option?: { id: Record<string, string>; title: string };
  referenced_actor_type?: string;
  referenced_actor_id?: string;
  email_address?: string;
}

// ─── Value extractors ─────────────────────────────────────────────────────────

export function extractText(
  values: Record<string, AttioValue[]>,
  slug: string
): string | null {
  const arr = values[slug];
  if (!arr?.length) return null;
  const v = arr[0];
  if (typeof v.value === "string") return v.value || null;
  return null;
}

/** Extract a single title from a "status" or "select" attribute. */
export function extractStatus(
  values: Record<string, AttioValue[]>,
  slug: string
): string | null {
  const arr = values[slug];
  if (!arr?.length) return null;
  return arr[0].status?.title ?? arr[0].option?.title ?? null;
}

/** Extract all titles from a multi-value "status" or "select" attribute. */
export function extractMultiStatus(
  values: Record<string, AttioValue[]>,
  slug: string
): string[] {
  const arr = values[slug];
  if (!arr?.length) return [];
  return arr
    .map((v) => v.status?.title ?? v.option?.title ?? null)
    .filter(Boolean) as string[];
}

export function extractCheckbox(
  values: Record<string, AttioValue[]>,
  slug: string
): boolean {
  const arr = values[slug];
  if (!arr?.length) return false;
  return arr[0].checked ?? false;
}

export function extractCurrency(
  values: Record<string, AttioValue[]>,
  slug: string
): number | null {
  const arr = values[slug];
  if (!arr?.length) return null;
  return arr[0].currency_value ?? null;
}

// Actor references: stored as emails (workspace members).
// Phase 3 will resolve member IDs → emails via /v2/workspace-members.
// For now we store the referenced_actor_id as a placeholder.
export function extractActorRefs(
  values: Record<string, AttioValue[]>,
  slug: string
): string[] {
  const arr = values[slug];
  if (!arr?.length) return [];
  return arr
    .map((v) => v.email_address ?? v.referenced_actor_id ?? null)
    .filter(Boolean) as string[];
}

// ─── Full entry → local Deal field mapper ────────────────────────────────────

export function mapEntryToLocalFields(
  entry: AttioListEntry,
  companyName: string
) {
  const ev = entry.entry_values;
  const lighthouseUrl = extractText(ev, "lighthouse") ?? null;

  return {
    company_name: companyName,
    attio_record_id: entry.parent_record_id,
    attio_entry_id: entry.id.entry_id,
    status: extractStatus(ev, "status_3"),
    funnel: extractStatus(ev, "funnel"),
    fund: extractMultiStatus(ev, "fund_5"),
    linkedin_founder: extractText(ev, "linkedin_founder"),
    dd_lead: extractActorRefs(ev, "dd_lead_1"),
    deal_support: extractActorRefs(ev, "deal_support"),
    thesis: extractMultiStatus(ev, "thesis"),
    lighthouse_url: lighthouseUrl,
    outline_doc_id: parseOutlineDocId(lighthouseUrl),
    source: extractStatus(ev, "source_7"),
    description: extractText(ev, "description"),
    next_steps: extractText(ev, "next_steps"),
    pass_rationale: extractMultiStatus(ev, "pass_rationale_7"),
    pass_rationale_detail: extractText(ev, "pass_rationale"),
    investment_amount_smbc: extractCurrency(ev, "investment_amount_smbc"),
    sourced: extractCheckbox(ev, "sourced"),
  };
}

// ─── Push mapper: local fields → Attio entry_values PATCH body ───────────────
// Phase 3 will expand this; stub included for /api/sync/push.

export function mapLocalFieldsToAttio(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const textFields: Record<string, string> = {
    linkedin_founder: "linkedin_founder",
    description: "description",
    next_steps: "next_steps",
    pass_rationale_detail: "pass_rationale",
  };
  for (const [local, slug] of Object.entries(textFields)) {
    if (local in fields)
      out[slug] = [{ value: fields[local] ?? "" }];
  }

  // Status attributes (status_3, funnel) — Attio expects { status: title }
  if ("status" in fields) out["status_3"] = [{ status: fields.status }];
  if ("funnel" in fields) out["funnel"] = [{ status: fields.funnel }];
  // Select attribute (source_7) — Attio expects { option: title }
  if ("source" in fields) out["source_7"] = [{ option: fields.source }];
  // Checkbox: Attio expects [{ value: boolean }], not checked
  if ("sourced" in fields) out["sourced"] = [{ value: !!fields.sourced }];
  // Currency: only send when a valid number; Attio rejects null/undefined
  const amount = fields.investment_amount_smbc;
  if (
    typeof amount === "number" &&
    !Number.isNaN(amount) &&
    Number.isFinite(amount)
  ) {
    out["investment_amount_smbc"] = [{ currency_value: amount }];
  }

  // Multi-select (fund, thesis, pass_rationale) — Attio expects { option: title } per value
  const multiSelectFields: Record<string, string> = {
    fund: "fund_5",
    thesis: "thesis",
    pass_rationale: "pass_rationale_7",
  };
  for (const [local, slug] of Object.entries(multiSelectFields)) {
    if (local in fields && Array.isArray(fields[local])) {
      out[slug] = (fields[local] as string[]).map((v) => ({ option: v }));
    }
  }

  // Actor refs: dd_lead, deal_support — Phase 3 will reverse-map emails → member IDs
  for (const [local, slug] of [
    ["dd_lead", "dd_lead_1"],
    ["deal_support", "deal_support"],
  ]) {
    if (local in fields && Array.isArray(fields[local])) {
      out[slug] = (fields[local] as string[]).map((id) => ({
        referenced_actor_type: "workspace-member",
        referenced_actor_id: id,
      }));
    }
  }

  return out;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function parseOutlineDocId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}
