-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company_name" TEXT NOT NULL,
    "attio_record_id" TEXT,
    "attio_entry_id" TEXT,
    "status" TEXT,
    "funnel" TEXT,
    "fund" TEXT NOT NULL DEFAULT '[]',
    "linkedin_founder" TEXT,
    "dd_lead" TEXT NOT NULL DEFAULT '[]',
    "deal_support" TEXT NOT NULL DEFAULT '[]',
    "thesis" TEXT NOT NULL DEFAULT '[]',
    "lighthouse_url" TEXT,
    "source" TEXT,
    "description" TEXT,
    "next_steps" TEXT,
    "pass_rationale" TEXT NOT NULL DEFAULT '[]',
    "pass_rationale_detail" TEXT,
    "investment_amount_smbc" REAL,
    "sourced" BOOLEAN NOT NULL DEFAULT false,
    "outline_doc_id" TEXT,
    "harmonic_id" TEXT,
    "employee_count" INTEGER,
    "total_funding" REAL,
    "last_funding_stage" TEXT,
    "last_funding_date" DATETIME,
    "headcount_growth_6m" REAL,
    "harmonic_enriched_at" DATETIME,
    "missing_in_attio" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deal_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "outline_doc_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Note_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "Deal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deal_id" TEXT NOT NULL,
    "raw_text" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transcript_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "Deal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataRoomFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deal_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "extracted_text" TEXT,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataRoomFile_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "Deal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "synced_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Deal_attio_record_id_key" ON "Deal"("attio_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_attio_entry_id_key" ON "Deal"("attio_entry_id");
