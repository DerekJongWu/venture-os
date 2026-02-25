# Deal Flow App — Project Context

## What This Is
A local Next.js deal flow pipeline for a VC fund. Syncs structured deal data 
with Attio and notes/documents with Lighthouse (self-hosted Outline instance). 
Harmonic is used for company enrichment. Runs locally with a SQLite database.

## Key Architectural Rules
- Attio = structured deal metadata ONLY. Never write notes to Attio.
- Lighthouse (Outline MCP) = all notes, memos, meeting docs, transcripts.
- Harmonic = read-only company enrichment (employee count, funding, growth signals).
- SQLite is the local source of truth for the UI.
- The app never creates records in Attio or Lighthouse. All records originate externally.
- The local DB controls which deals are tracked. New Attio deals do not appear 
  locally until explicitly added via the Add Deal flow.
- lighthouse_url is always read from Attio and is READ-ONLY in the app. Never written.
- Never sync Note content to Attio.

## Environment Variables
ATTIO_API_KEY=
OUTLINE_API_TOKEN=
OUTLINE_MCP_ENDPOINT=        # your AWS-hosted MCP server URL
ANTHROPIC_API_KEY=
HARMONIC_API_KEY=
DATABASE_URL="file:./dev.db"

---

## Attio Configuration

### List: Pipeline
- list_id: 1386c3a1-4ebe-4cec-96bb-43a7619e145b
- api_slug: pipeline_1
- parent_object: companies

### Pipeline List Field Mappings

| Attio api_slug         | attribute_id                          | Local Field            | Type           | Writable      |
|------------------------|---------------------------------------|------------------------|----------------|---------------|
| status_3               | 136b993d-098c-418f-a97d-dd3b1510be24 | status                 | status         | ✅            |
| funnel                 | 9afc0415-bad5-4297-9421-82edba5e0695 | funnel                 | status         | ✅            |
| fund_5                 | c8c583fd-be89-4fdb-830d-7f5ba17ba8a0 | fund                   | select[]       | ✅            |
| linkedin_founder       | ecbf2a1c-0bf8-4602-8e01-5aaf820f3b8f | linkedin_founder       | text           | ✅            |
| dd_lead_1              | d9bc9580-66e1-4642-bcc6-8f5ade0992e6 | dd_lead                | actor-ref[]    | ✅            |
| deal_support           | c4766ab1-0aeb-4bea-bdd3-c1563fa9ddb2 | deal_support           | actor-ref[]    | ✅            |
| thesis                 | 2101fe16-c5fe-4da5-a86e-91c5d614861d | thesis                 | select[]       | ✅            |
| lighthouse             | d5abb97d-39ff-4a20-bf10-118a4e39729f | lighthouse_url         | text           | 🚫 read-only  |
| source_7               | 5dbca1bd-ba72-4f54-884e-717041d7ae1c | source                 | select         | ✅            |
| description            | 84c5916d-de0b-4ced-9c09-7b589a4da43e | description            | text           | ✅            |
| next_steps             | 214dc1f4-8583-4803-b8e6-acd0f6e83404 | next_steps             | text           | ✅            |
| pass_rationale_7       | ff934df2-7cdc-4fe8-bcf7-ab7310d06b80 | pass_rationale         | select[]       | ✅            |
| pass_rationale         | 36c152cc-108a-45bc-a09e-1c18fb3809cf | pass_rationale_detail  | text           | ✅            |
| investment_amount_smbc | dbe69381-a827-4fb3-8d2c-16b11de0de78 | investment_amount_smbc | currency (USD) | ✅            |
| sourced                | 6d919255-aa58-42c5-8bdf-123292fb5725 | sourced                | checkbox       | ✅            |

### Status Options (status_3) — all 15 values
Upfront Pass, Reviewed and Pass, Track, Need Intro, Outreach, Initial Meetings,
Intro in Process, Partner Screening, Partner Meetings, Send Pass, Deep Diligence,
IC Review, IC Voted - Pass/Track, IC Approved / Legal - Funding Process, Portfolio

### Funnel Options
Top of Funnel, Mid Funnel, Bottom of Funnel, Pass, Portfolio, Pre-Funnel

### Fund Options (multiselect)
Flagship, SMBC, Horizons, Horizons - Harbor

### Thesis Options (multiselect)
DeepTech - AI Apps/Infra, DeepTech - Cyber/RiskTech, DeepTech - Quantum,
DeepTech - Blockchain, AI-First Vertical Software - BankTech,
AI-First Vertical Software - Wealth/Asset/Capital Markets Tech,
AI-First Vertical Software - Insurtech, AI-First Vertical Software - HealthTech,
AI-First Vertical Software - Other, Payments - Commerce,
Payments - Value Added Services, Payments - CFO Tech,
Payments - Payroll & Benefits, LatAm Pipeline, Japan Pipeline

### Source Options
Lighthouse, Founder Referral, VC Referral, LP / Strategic Partner Referral,
Personal, Inbound, Other

### Pass Rationale Options (multiselect)
Founder Profile, GTM, ACVs, Revenue Mix, TAM, Traction, Valuation,
Cap Table Quality, Margin Profile, Other, Round Dynamics, Competition,
Product/Vision, Geo

---

## Prisma Schema
```prisma
model Deal {
  id                      String    @id @default(cuid())

  // Core identity
  company_name            String
  attio_record_id         String?   @unique  // companies object record ID
  attio_entry_id          String?   @unique  // pipeline list entry ID

  // Attio Pipeline fields
  status                  String?   // full Attio status value (all 15 options)
  funnel                  String?
  fund                    String[]
  linkedin_founder        String?
  dd_lead                 String[]  // workspace member emails
  deal_support            String[]  // workspace member emails
  thesis                  String[]
  lighthouse_url          String?   // READ-ONLY, always sourced from Attio
  source                  String?
  description             String?
  next_steps              String?
  pass_rationale          String[]
  pass_rationale_detail   String?
  investment_amount_smbc  Float?
  sourced                 Boolean   @default(false)

  // Lighthouse / Outline
  outline_doc_id          String?   // parsed from lighthouse_url on ingest

  // Harmonic enrichment (cached locally)
  harmonic_id             String?
  employee_count          Int?
  total_funding           Float?
  last_funding_stage      String?
  last_funding_date       DateTime?
  headcount_growth_6m     Float?
  harmonic_enriched_at    DateTime?

  // Relations
  notes                   Note[]
  transcripts             Transcript[]
  dataroom_files          DataRoomFile[]

  last_synced_at          DateTime?
  created_at              DateTime  @default(now())
  updated_at              DateTime  @updatedAt
}

model Note {
  id             String   @id @default(cuid())
  deal_id        String
  deal           Deal     @relation(fields: [deal_id], references: [id])
  content        String   // markdown
  type           String   // "meeting" | "call" | "general" | "memo" | "transcript_summary"
  outline_doc_id String?
  created_at     DateTime @default(now())
  updated_at     DateTime @updatedAt
}

model Transcript {
  id          String   @id @default(cuid())
  deal_id     String
  deal        Deal     @relation(fields: [deal_id], references: [id])
  raw_text    String
  processed   Boolean  @default(false)
  summary     String?
  created_at  DateTime @default(now())
}

model DataRoomFile {
  id             String   @id @default(cuid())
  deal_id        String
  deal           Deal     @relation(fields: [deal_id], references: [id])
  file_name      String
  file_path      String   // /data/dataroom/{deal_id}/{filename}
  file_type      String   // "pdf" | "docx" | "xlsx" | "other"
  extracted_text String?
  uploaded_at    DateTime @default(now())
}

model SyncLog {
  id          String   @id @default(cuid())
  entity_type String   // "deal"
  entity_id   String
  direction   String   // "push" | "pull"
  source      String   // "attio" | "lighthouse" | "harmonic"
  status      String   // "success" | "error"
  error       String?
  synced_at   DateTime @default(now())
}
```

---

## Kanban Swim Lane Configuration

The pipeline UI groups Attio's 15 statuses into 5 swim lanes.
Status is always stored and synced as the full Attio value.

| Swim Lane        | Attio Status Values                                                     |
|------------------|-------------------------------------------------------------------------|
| Top of Funnel    | Track, Need Intro, Outreach, Initial Meetings, Intro in Process         |
| Active Diligence | Partner Screening, Partner Meetings, Deep Diligence                     |
| IC / Legal       | IC Review, IC Voted - Pass/Track, IC Approved / Legal - Funding Process |
| Portfolio        | Portfolio                                                               |
| Passed           | Upfront Pass, Reviewed and Pass, Send Pass                              |

Rules:
- Dragging a card between swim lanes prompts the user to select the specific
  target status from the valid options in that lane (never auto-assign).
- The status dropdown on the deal card and detail page always shows all 15 options.
- On status change, immediately PATCH the Attio list entry.

---

## Sync Architecture

### Core Principle
The app never creates records in Attio or Lighthouse. All records originate 
externally. The app syncs inbound from both systems and pushes local edits 
back out. The local DB controls which deals are tracked.

### Attio Sync

#### Pull (Local-Driven)
- Triggered on app load + every 15 min via cron
- Fetch all attio_entry_ids currently in the local Deal table
- Batch fetch those specific records from Attio's pipeline_1 list
- Upsert returned data into local Deal table by attio_entry_id
- If Attio returns no data for an entry_id (deleted or moved out of pipeline),
  flag the local record with a "missing in Attio" warning — do not delete locally

#### Push
- On any field mutation (except lighthouse_url), PATCH the Attio list entry
  immediately using attio_entry_id
- Conflict resolution: last-write-wins by updated_at
- DD Lead and Deal Support are actor-references — resolve member IDs to emails
  on pull, reverse-map emails to member IDs on push

#### Add Deal Flow (only way to create a local record)
- Search bar in pipeline UI queries Attio pipeline_1 list by company name
- User selects a result → local Deal record created with attio_entry_id
- Immediately pull full field data from Attio for that entry
- Parse outline_doc_id from lighthouse_url and store on Deal record
- Deal is now in the sync loop for all future pulls
- This is the ONLY place a local Deal record is created

### Lighthouse (Outline) Sync
- The app never creates Outline documents. Docs are created by the team
  directly in Lighthouse.
- outline_doc_id is parsed from lighthouse_url when the Attio record is 
  first pulled and stored locally for subsequent API calls.
- On deal detail open: fetch live Outline doc content via fetchDocument using
  outline_doc_id. Always fetch live, do not serve from local cache.
- On note/content edit in the app: call updateDocument or appendToDocument
  on the Outline MCP immediately.
- MCP endpoint: process.env.OUTLINE_MCP_ENDPOINT

### Harmonic Enrichment
- Read-only. Enrich by company domain or name.
- Cache results locally on the Deal record.
- Re-enrich manually via button on deal detail, or weekly via cron.
- Fields to pull: employee_count, total_funding, last_funding_stage,
  last_funding_date, headcount_growth_6m

---

## AI Features

Model: claude-sonnet-4-6 (streaming via Anthropic SDK)

All AI prompts receive a dealContext object:
```typescript
{
  deal: Deal,                    // full local DB record
  lighthouseContent: string,     // live-fetched Outline doc markdown
  dataRoomSummaries: string[]    // extracted text from uploaded files
}
```

### AI Routes
- POST /api/ai/process-transcript
  Input: raw transcript text + dealId
  Fetch dealContext, extract: key discussion points, action items, founder 
  signals, product insights, valuation/terms mentioned
  Save as Transcript (processed: true, summary: result)
  Append structured summary block to Lighthouse doc via appendToDocument
  Stream response to client

- POST /api/ai/generate-memo
  Input: dealId
  Fetch full dealContext (deal record + live lighthouse doc + data room text)
  Generate investment memo sections: Executive Summary, Company Overview,
  Market Opportunity, Team, Product & Technology, Traction & Metrics,
  Financials, Risks & Mitigations, Thesis Fit, Recommendation
  Save as Note (type: "memo")
  Append to Lighthouse doc via appendToDocument
  Stream response to client

- POST /api/ai/analyze-deal
  Input: dealId
  Fetch dealContext, run diligence checklist
  Output: information gaps, red flags, thesis alignment score (1-10 + rationale)
  Stream response to client

- POST /api/ai/ask-dataroom
  Input: dealId + question
  Pull extracted_text from all DataRoomFile records for this deal
  Answer with source file attribution
  Stream response to client

---

## Tech Stack
- Next.js 14 App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Prisma + SQLite (file:./dev.db)
- Anthropic SDK (streaming, claude-sonnet-4-6)
- @dnd-kit/core (kanban drag and drop)
- pdf-parse (data room PDF text extraction)
- mammoth (docx text extraction)
- node-cron (background sync every 15 min)
- Attio REST API (https://api.attio.com/v2)
- Outline MCP Server (self-hosted on AWS)
- Harmonic API (company enrichment)

---

## Current Build Status
Phase 1: ✅ Scaffold + Prisma schema + DB migrations
Phase 2: ✅ Pipeline UI (table + kanban views + Add Deal flow)
Phase 3: 🔲 Attio two-way sync
Phase 4: 🔲 Lighthouse (Outline) sync
Phase 5: 🔲 AI features
Phase 6: 🔲 Data room
Phase 7: 🔲 Harmonic enrichment
Phase 8: 🔲 Background jobs + settings + PDF export

## Known Issues
[add as you go]

## Decisions Log
- 2026-02-24: App never creates records in Attio or Lighthouse. External creation only.
- 2026-02-24: Local DB controls which deals are tracked (Option A). New Attio 
  records do not auto-appear locally — must be added via Add Deal search flow.
- 2026-02-24: lighthouse_url is read-only in app, always sourced from Attio.
- 2026-02-24: Attio pull is local-driven — only fetches entry_ids already in local DB.