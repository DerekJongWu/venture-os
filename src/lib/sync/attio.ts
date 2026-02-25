// ─── Attio two-way sync helpers ───────────────────────────────────────────────
//
// pull()        Batch-fetch tracked entries from Attio, upsert to local DB.
// push()        PATCH a single Attio list entry from local changed fields.
// searchAttio() Two-step company-name → pipeline-entry search.
// addDeal()     Create a local Deal record from an Attio entry_id.
//
// Actor-reference fields (dd_lead, deal_support) are stored locally as emails.
// On pull  : workspace member UUIDs  → emails  (via /v2/workspace-members)
// On push  : emails                  → UUIDs   (reverse map)

import { prisma } from "@/lib/prisma";
import {
  ATTIO_BASE,
  PIPELINE_LIST_ID,
  attioHeaders,
  mapEntryToLocalFields,
  mapLocalFieldsToAttio,
  extractStatus,
  extractMultiStatus,
  type AttioValue,
} from "@/lib/attio";
import { parseDealArrays, serializeJsonArray } from "@/lib/deal-utils";
import type { DealWithArrays } from "@/lib/deal-utils";

// ─── Workspace member cache ────────────────────────────────────────────────────

interface MemberCache {
  idToEmail: Map<string, string>;
  emailToId: Map<string, string>;
}

async function fetchMemberCache(): Promise<MemberCache> {
  const empty: MemberCache = { idToEmail: new Map(), emailToId: new Map() };
  if (!process.env.ATTIO_API_KEY) return empty;

  const res = await fetch(`${ATTIO_BASE}/workspace-members`, {
    headers: attioHeaders(),
  });
  if (!res.ok) {
    console.error(`fetchMemberCache: HTTP ${res.status}`);
    return empty;
  }

  const data = await res.json();
  const members: Array<{
    id: { workspace_member_id: string };
    email_address: string;
  }> = data.data ?? [];

  const idToEmail = new Map<string, string>();
  const emailToId = new Map<string, string>();
  for (const m of members) {
    const id = m.id?.workspace_member_id;
    const email = m.email_address;
    if (id && email) {
      idToEmail.set(id, email);
      emailToId.set(email.toLowerCase(), id);
    }
  }
  return { idToEmail, emailToId };
}

function resolveActorRefs(ids: string[], cache: MemberCache): string[] {
  return ids.map((id) => cache.idToEmail.get(id) ?? id);
}

function reverseActorRefs(emails: string[], cache: MemberCache): string[] {
  return emails.map((e) => cache.emailToId.get(e.toLowerCase()) ?? e);
}

// ─── pull() ───────────────────────────────────────────────────────────────────

export interface PullResult {
  synced: number;
  errors: string[];
}

export async function pull(): Promise<PullResult> {
  const errors: string[] = [];
  let synced = 0;

  if (!process.env.ATTIO_API_KEY) {
    return { synced: 0, errors: ["ATTIO_API_KEY not configured"] };
  }

  // 1. All tracked entries in the local DB
  const trackedDeals = await prisma.deal.findMany({
    where: { attio_entry_id: { not: null } },
    select: { id: true, attio_entry_id: true },
  });

  if (trackedDeals.length === 0) {
    return { synced: 0, errors: [] };
  }

  const entryIdToLocalId = new Map(
    trackedDeals
      .filter((d) => d.attio_entry_id)
      .map((d) => [d.attio_entry_id!, d.id])
  );
  const allEntryIds = Array.from(entryIdToLocalId.keys());

  // 2. Fetch workspace members once for actor-ref resolution
  const memberCache = await fetchMemberCache();

  // 3. Batch-fetch entries from Attio — 10 concurrent GETs
  const BATCH = 10;
  for (let i = 0; i < allEntryIds.length; i += BATCH) {
    const chunk = allEntryIds.slice(i, i + BATCH);

    const settled = await Promise.allSettled(
      chunk.map(async (entryId) => {
        const r = await fetch(
          `${ATTIO_BASE}/lists/${PIPELINE_LIST_ID}/entries/${entryId}`,
          { headers: attioHeaders() }
        );
        if (r.status === 404) return { entryId, entry: null, missing: true };
        if (!r.ok) throw new Error(`HTTP ${r.status} for entry ${entryId}`);
        const json = await r.json();
        return { entryId, entry: json.data, missing: false };
      })
    );

    for (const result of settled) {
      if (result.status === "rejected") {
        errors.push(String(result.reason?.message ?? result.reason));
        continue;
      }

      const { entryId, entry, missing } = result.value;
      const localId = entryIdToLocalId.get(entryId)!;

      // 4a. Entry not found in Attio → flag locally, do not delete
      if (missing || !entry) {
        await prisma.deal.update({
          where: { id: localId },
          data: { missing_in_attio: true },
        });
        await prisma.syncLog.create({
          data: {
            entity_type: "deal",
            entity_id: localId,
            direction: "pull",
            source: "attio",
            status: "error",
            error: "Not found in Attio — missing_in_attio flagged",
          },
        });
        errors.push(`Deal ${localId}: not found in Attio`);
        continue;
      }

      // 4b. Map Attio fields to local schema (company_name kept from local DB)
      const fields = mapEntryToLocalFields(entry, "");

      // 4c. Resolve actor-ref UUIDs → emails
      const ddLeadEmails = resolveActorRefs(fields.dd_lead, memberCache);
      const dealSupportEmails = resolveActorRefs(
        fields.deal_support,
        memberCache
      );

      // 4d. Upsert
      try {
        await prisma.deal.update({
          where: { id: localId },
          data: {
            // company_name intentionally preserved (not re-fetched on pull)
            attio_record_id: fields.attio_record_id,
            status: fields.status ?? undefined,
            funnel: fields.funnel ?? undefined,
            fund: serializeJsonArray(fields.fund),
            linkedin_founder: fields.linkedin_founder ?? undefined,
            dd_lead: serializeJsonArray(ddLeadEmails),
            deal_support: serializeJsonArray(dealSupportEmails),
            thesis: serializeJsonArray(fields.thesis),
            // lighthouse_url is read-only, always sourced from Attio
            lighthouse_url: fields.lighthouse_url ?? undefined,
            outline_doc_id: fields.outline_doc_id ?? undefined,
            source: fields.source ?? undefined,
            description: fields.description ?? undefined,
            next_steps: fields.next_steps ?? undefined,
            pass_rationale: serializeJsonArray(fields.pass_rationale),
            pass_rationale_detail: fields.pass_rationale_detail ?? undefined,
            investment_amount_smbc:
              fields.investment_amount_smbc ?? undefined,
            sourced: fields.sourced,
            missing_in_attio: false,
            last_synced_at: new Date(),
          },
        });

        await prisma.syncLog.create({
          data: {
            entity_type: "deal",
            entity_id: localId,
            direction: "pull",
            source: "attio",
            status: "success",
          },
        });

        synced++;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Unknown error";
        errors.push(`Deal ${localId}: ${msg}`);
        await prisma.syncLog.create({
          data: {
            entity_type: "deal",
            entity_id: localId,
            direction: "pull",
            source: "attio",
            status: "error",
            error: msg.slice(0, 500),
          },
        });
      }
    }
  }

  // 5. Write one summary SyncLog entry so the status endpoint can query it
  await prisma.syncLog.create({
    data: {
      entity_type: "sync",
      entity_id: "attio_pull",
      direction: "pull",
      source: "attio",
      status: errors.length > 0 ? "error" : "success",
      error:
        errors.length > 0
          ? errors.join("; ").slice(0, 500)
          : null,
    },
  });

  return { synced, errors };
}

// ─── push() ───────────────────────────────────────────────────────────────────

export async function push(
  dealId: string,
  changedFields: Partial<DealWithArrays>
): Promise<void> {
  if (!process.env.ATTIO_API_KEY) {
    throw new Error("ATTIO_API_KEY not configured");
  }

  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal?.attio_entry_id) {
    throw new Error("Deal has no Attio entry ID — cannot push");
  }

  // Never push lighthouse_url
  const fields = { ...changedFields } as Record<string, unknown>;
  delete fields.lighthouse_url;

  // Reverse-map emails → workspace member UUIDs for actor-ref fields
  if (
    (Array.isArray(fields.dd_lead) && fields.dd_lead.length > 0) ||
    (Array.isArray(fields.deal_support) && fields.deal_support.length > 0)
  ) {
    const memberCache = await fetchMemberCache();
    if (Array.isArray(fields.dd_lead)) {
      fields.dd_lead = reverseActorRefs(
        fields.dd_lead as string[],
        memberCache
      );
    }
    if (Array.isArray(fields.deal_support)) {
      fields.deal_support = reverseActorRefs(
        fields.deal_support as string[],
        memberCache
      );
    }
  }

  const attioValues = mapLocalFieldsToAttio(fields);
  if (Object.keys(attioValues).length === 0) {
    throw new Error("No writable fields to push to Attio");
  }

  // Use PUT so multiselect fields (thesis, fund, pass_rationale) are overwritten,
  // not appended. PATCH would keep appending and never replace.
  const res = await fetch(
    `${ATTIO_BASE}/lists/${PIPELINE_LIST_ID}/entries/${deal.attio_entry_id}`,
    {
      method: "PUT",
      headers: attioHeaders(),
      body: JSON.stringify({ data: { entry_values: attioValues } }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Attio push failed for deal ${dealId}: ${errText}`);
    await prisma.syncLog.create({
      data: {
        entity_type: "deal",
        entity_id: dealId,
        direction: "push",
        source: "attio",
        status: "error",
        error: `${res.status}: ${errText.slice(0, 500)}`,
      },
    });
    throw new Error(`Attio rejected push: ${res.status} — ${errText.slice(0, 200)}`);
  }

  await prisma.deal.update({
    where: { id: dealId },
    data: { last_synced_at: new Date() },
  });

  await prisma.syncLog.create({
    data: {
      entity_type: "deal",
      entity_id: dealId,
      direction: "push",
      source: "attio",
      status: "success",
    },
  });
}

// ─── searchAttio() ────────────────────────────────────────────────────────────

export interface AttioSearchResult {
  attio_entry_id: string;
  attio_record_id: string;
  company_name: string;
  status: string | null;
  funnel: string | null;
  fund: string[];
  thesis: string[];
  source: string | null;
  already_tracked: boolean;
}

type PipelineEntry = {
  id: { entry_id: string };
  parent_record_id: string;
  entry_values: Record<string, AttioValue[]>;
};

/**
 * Fetch pipeline entries for the given company record IDs using Attio's
 * parent_record.target_record_id filter. This is efficient regardless of
 * pipeline size (avoids fetching all entries).
 */
async function fetchPipelineEntriesForRecords(
  recordIds: string[]
): Promise<PipelineEntry[]> {
  if (recordIds.length === 0) return [];

  // Build an $or filter so we can batch all record IDs in one request.
  const orClauses = recordIds.map((id) => ({
    parent_record: { target_record_id: { $eq: id } },
  }));

  const body = recordIds.length === 1
    ? { filter: orClauses[0], limit: 25 }
    : { filter: { $or: orClauses }, limit: 25 };

  const res = await fetch(
    `${ATTIO_BASE}/lists/${PIPELINE_LIST_ID}/entries/query`,
    {
      method: "POST",
      headers: attioHeaders(),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Attio entries fetch failed: ${err}`);
  }
  return (await res.json()).data ?? [];
}

/**
 * Look up a pipeline entry directly by its entry ID.
 * Used when the user pastes a UUID (Attio list entry ID).
 */
async function lookupByEntryId(entryId: string): Promise<AttioSearchResult[]> {
  const res = await fetch(
    `${ATTIO_BASE}/lists/${PIPELINE_LIST_ID}/entries/${entryId}`,
    { headers: attioHeaders() }
  );
  if (!res.ok) {
    if (res.status === 404) return [];
    const err = await res.text();
    throw new Error(`Attio entry lookup failed: ${err}`);
  }
  const entry: PipelineEntry = (await res.json()).data;
  const recordId = entry.parent_record_id;
  if (!recordId) return [];

  // Fetch company name
  const companyRes = await fetch(
    `${ATTIO_BASE}/objects/companies/records/${recordId}`,
    { headers: attioHeaders() }
  );
  const companyName = companyRes.ok
    ? ((await companyRes.json()).data?.values?.name as Array<{ value: string }> | undefined)?.[0]?.value ?? "Unknown"
    : "Unknown";

  const existing = await prisma.deal.findUnique({ where: { attio_entry_id: entryId } });

  return [{
    attio_entry_id: entryId,
    attio_record_id: recordId,
    company_name: companyName,
    status: extractStatus(entry.entry_values, "status_3"),
    funnel: extractStatus(entry.entry_values, "funnel"),
    fund: extractMultiStatus(entry.entry_values, "fund_5"),
    thesis: extractMultiStatus(entry.entry_values, "thesis"),
    source: extractStatus(entry.entry_values, "source_7"),
    already_tracked: !!existing,
  }];
}

/**
 * Extract the bare hostname from a company website URL or domain string.
 * e.g. "https://www.acme.com/about" → "acme.com"
 *      "acme.com"                   → "acme.com"
 * Returns null if the input doesn't look like a URL/domain.
 */
function extractCompanyDomain(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes(" ")) return null;
  const withProto = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  try {
    const hostname = new URL(withProto).hostname.replace(/^www\./, "");
    // Require at least one dot (e.g. "acme.com") — bare words like "acme" are name searches
    return hostname.split(".").length >= 2 ? hostname : null;
  } catch {
    return null;
  }
}

/**
 * Search the Attio pipeline by company website domain.
 * Used when the user pastes a URL like https://acme.com.
 */
async function lookupByDomain(domain: string): Promise<AttioSearchResult[]> {
  // Step 1: Find companies whose domain matches
  const companiesRes = await fetch(
    `${ATTIO_BASE}/objects/companies/records/query`,
    {
      method: "POST",
      headers: attioHeaders(),
      body: JSON.stringify({
        filter: { domains: { $eq: domain } },
        limit: 5,
        offset: 0,
      }),
    }
  );
  if (!companiesRes.ok) {
    const err = await companiesRes.text();
    throw new Error(`Attio domain search failed: ${err}`);
  }

  const companies: Array<{
    id: { record_id: string };
    values: Record<string, unknown[]>;
  }> = (await companiesRes.json()).data ?? [];

  if (companies.length === 0) return [];

  const recordIds = companies.map((c) => c.id.record_id);

  // Step 2: Match pipeline entries client-side (see fetchPipelineEntriesForRecords)
  const entries = await fetchPipelineEntriesForRecords(recordIds);
  const entryByRecordId = new Map(
    entries.map((e) => [e.parent_record_id, e])
  );

  const trackedRecordIds = new Set(
    (
      await prisma.deal.findMany({
        where: { attio_record_id: { in: recordIds } },
        select: { attio_record_id: true },
      })
    )
      .map((d) => d.attio_record_id)
      .filter(Boolean) as string[]
  );

  return companies
    .filter((c) => entryByRecordId.has(c.id.record_id))
    .map((c) => {
      const entry = entryByRecordId.get(c.id.record_id)!;
      const nameArr = c.values.name as Array<{ value: string }> | undefined;
      const ev = entry.entry_values;
      return {
        attio_entry_id: entry.id.entry_id,
        attio_record_id: c.id.record_id,
        company_name: nameArr?.[0]?.value ?? "Unknown",
        status: extractStatus(ev, "status_3"),
        funnel: extractStatus(ev, "funnel"),
        fund: extractMultiStatus(ev, "fund_5"),
        thesis: extractMultiStatus(ev, "thesis"),
        source: extractStatus(ev, "source_7"),
        already_tracked: trackedRecordIds.has(c.id.record_id),
      };
    });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function searchAttio(
  query: string
): Promise<AttioSearchResult[]> {
  if (!query.trim()) return [];
  if (!process.env.ATTIO_API_KEY) throw new Error("ATTIO_API_KEY not configured");

  const q = query.trim();

  // If the input is a UUID, treat it as an Attio list entry ID (direct lookup)
  if (UUID_RE.test(q)) return lookupByEntryId(q);

  // If the input looks like a company website URL/domain, search by domain
  const domain = extractCompanyDomain(q);
  if (domain) return lookupByDomain(domain);

  // Step 1: Search Attio companies by name
  const companiesRes = await fetch(
    `${ATTIO_BASE}/objects/companies/records/query`,
    {
      method: "POST",
      headers: attioHeaders(),
      body: JSON.stringify({
        filter: { name: { $contains: q } },
        limit: 20,
        offset: 0,
      }),
    }
  );

  if (!companiesRes.ok) {
    const err = await companiesRes.text();
    throw new Error(`Attio companies search failed: ${err}`);
  }

  const companiesData = await companiesRes.json();
  const companies: Array<{
    id: { record_id: string };
    values: Record<string, unknown[]>;
  }> = companiesData.data ?? [];

  if (companies.length === 0) return [];

  const recordIds = companies.map((c) => c.id.record_id);

  // Step 2: Match pipeline entries client-side (see fetchPipelineEntriesForRecords)
  const entries = await fetchPipelineEntriesForRecords(recordIds);
  const entryByRecordId = new Map(
    entries.map((e) => [e.parent_record_id, e])
  );

  // Check which record IDs are already tracked locally
  const trackedRecordIds = new Set(
    (
      await prisma.deal.findMany({
        where: { attio_record_id: { in: recordIds } },
        select: { attio_record_id: true },
      })
    )
      .map((d) => d.attio_record_id)
      .filter(Boolean) as string[]
  );

  return companies
    .filter((c) => entryByRecordId.has(c.id.record_id))
    .map((c) => {
      const entry = entryByRecordId.get(c.id.record_id)!;
      const nameArr = c.values.name as Array<{ value: string }> | undefined;
      const ev = entry.entry_values;
      return {
        attio_entry_id: entry.id.entry_id,
        attio_record_id: c.id.record_id,
        company_name: nameArr?.[0]?.value ?? "Unknown",
        status: extractStatus(ev, "status_3"),
        funnel: extractStatus(ev, "funnel"),
        fund: extractMultiStatus(ev, "fund_5"),
        thesis: extractMultiStatus(ev, "thesis"),
        source: extractStatus(ev, "source_7"),
        already_tracked: trackedRecordIds.has(c.id.record_id),
      };
    });
}

// ─── addDeal() ────────────────────────────────────────────────────────────────

export async function addDeal(
  attio_entry_id: string
): Promise<DealWithArrays> {
  if (!process.env.ATTIO_API_KEY) throw new Error("ATTIO_API_KEY not configured");

  // Return existing local record if already tracked
  const existing = await prisma.deal.findUnique({ where: { attio_entry_id } });
  if (existing) return parseDealArrays(existing);

  // Fetch entry from Attio
  const entryRes = await fetch(
    `${ATTIO_BASE}/lists/${PIPELINE_LIST_ID}/entries/${attio_entry_id}`,
    { headers: attioHeaders() }
  );
  if (!entryRes.ok) {
    throw new Error(`Failed to fetch Attio entry: ${entryRes.status}`);
  }
  const entry = (await entryRes.json()).data;

  // Fetch parent company to get the company name
  const recordId = entry.parent_record_id;
  if (!recordId) throw new Error("Entry has no parent company record");

  const companyRes = await fetch(
    `${ATTIO_BASE}/objects/companies/records/${recordId}`,
    { headers: attioHeaders() }
  );
  if (!companyRes.ok) {
    throw new Error(`Failed to fetch company record: ${companyRes.status}`);
  }
  const companyData = await companyRes.json();
  const nameArr = companyData.data?.values?.name as
    | Array<{ value: string }>
    | undefined;
  const companyName = nameArr?.[0]?.value ?? "Unknown";

  // Map Attio entry fields to local schema
  const fields = mapEntryToLocalFields(entry, companyName);

  // Resolve actor-ref UUIDs → emails
  const memberCache = await fetchMemberCache();
  const ddLeadEmails = resolveActorRefs(fields.dd_lead, memberCache);
  const dealSupportEmails = resolveActorRefs(fields.deal_support, memberCache);

  // Create local Deal record
  const deal = await prisma.deal.create({
    data: {
      company_name: fields.company_name,
      attio_record_id: fields.attio_record_id,
      attio_entry_id: fields.attio_entry_id,
      status: fields.status ?? undefined,
      funnel: fields.funnel ?? undefined,
      fund: serializeJsonArray(fields.fund),
      linkedin_founder: fields.linkedin_founder ?? undefined,
      dd_lead: serializeJsonArray(ddLeadEmails),
      deal_support: serializeJsonArray(dealSupportEmails),
      thesis: serializeJsonArray(fields.thesis),
      lighthouse_url: fields.lighthouse_url ?? undefined,
      outline_doc_id: fields.outline_doc_id ?? undefined,
      source: fields.source ?? undefined,
      description: fields.description ?? undefined,
      next_steps: fields.next_steps ?? undefined,
      pass_rationale: serializeJsonArray(fields.pass_rationale),
      pass_rationale_detail: fields.pass_rationale_detail ?? undefined,
      investment_amount_smbc: fields.investment_amount_smbc ?? undefined,
      sourced: fields.sourced,
      last_synced_at: new Date(),
    },
  });

  await prisma.syncLog.create({
    data: {
      entity_type: "deal",
      entity_id: deal.id,
      direction: "pull",
      source: "attio",
      status: "success",
    },
  });

  return parseDealArrays(deal);
}

// ─── resyncDeal() ─────────────────────────────────────────────────────────────

/**
 * Re-fetch a deal's Attio entry and update the local DB record.
 * Used to fix stale data (e.g. after a bug fix to field extraction).
 */
export async function resyncDeal(dealId: string): Promise<DealWithArrays> {
  if (!process.env.ATTIO_API_KEY) throw new Error("ATTIO_API_KEY not configured");

  const local = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!local) throw new Error("Deal not found");
  if (!local.attio_entry_id) throw new Error("Deal has no Attio entry ID");

  // Fetch entry from Attio
  const entryRes = await fetch(
    `${ATTIO_BASE}/lists/${PIPELINE_LIST_ID}/entries/${local.attio_entry_id}`,
    { headers: attioHeaders() }
  );
  if (!entryRes.ok) throw new Error(`Failed to fetch Attio entry: ${entryRes.status}`);
  const entry = (await entryRes.json()).data;

  const recordId = entry.parent_record_id;
  if (!recordId) throw new Error("Entry has no parent company record");

  // Fetch company name
  const companyRes = await fetch(
    `${ATTIO_BASE}/objects/companies/records/${recordId}`,
    { headers: attioHeaders() }
  );
  if (!companyRes.ok) throw new Error(`Failed to fetch company record: ${companyRes.status}`);
  const nameArr = (await companyRes.json()).data?.values?.name as Array<{ value: string }> | undefined;
  const companyName = nameArr?.[0]?.value ?? local.company_name;

  const fields = mapEntryToLocalFields(entry, companyName);
  const memberCache = await fetchMemberCache();
  const ddLeadEmails = resolveActorRefs(fields.dd_lead, memberCache);
  const dealSupportEmails = resolveActorRefs(fields.deal_support, memberCache);

  const deal = await prisma.deal.update({
    where: { id: dealId },
    data: {
      company_name: companyName,
      attio_record_id: fields.attio_record_id,
      status: fields.status ?? undefined,
      funnel: fields.funnel ?? undefined,
      fund: serializeJsonArray(fields.fund),
      linkedin_founder: fields.linkedin_founder ?? undefined,
      dd_lead: serializeJsonArray(ddLeadEmails),
      deal_support: serializeJsonArray(dealSupportEmails),
      thesis: serializeJsonArray(fields.thesis),
      lighthouse_url: fields.lighthouse_url ?? undefined,
      outline_doc_id: fields.outline_doc_id ?? undefined,
      source: fields.source ?? undefined,
      description: fields.description ?? undefined,
      next_steps: fields.next_steps ?? undefined,
      pass_rationale: serializeJsonArray(fields.pass_rationale),
      pass_rationale_detail: fields.pass_rationale_detail ?? undefined,
      investment_amount_smbc: fields.investment_amount_smbc ?? undefined,
      sourced: fields.sourced,
      missing_in_attio: false,
      last_synced_at: new Date(),
    },
  });

  return parseDealArrays(deal);
}
