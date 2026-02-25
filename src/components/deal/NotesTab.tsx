"use client";

import { useState, useEffect, useCallback } from "react";
import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  deal: DealWithArrays;
}

/** Parse the Outline doc ID from a Lighthouse URL (last path segment). */
function parseDocIdFromUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

export function NotesTab({ deal }: Props) {
  const [docId, setDocId] = useState<string | null>(
    deal.outline_doc_id ?? null
  );
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the last content successfully saved so we skip no-op writes.
  const [savedContent, setSavedContent] = useState("");

  // ─── Step 1: if outline_doc_id is missing but lighthouse_url exists,
  //     parse it, persist it to the DB, then set local state. ────────────────
  useEffect(() => {
    if (docId) return;
    if (!deal.lighthouse_url) return;

    const parsed = parseDocIdFromUrl(deal.lighthouse_url);
    if (!parsed) return;

    // Fire-and-forget PATCH — the deal page will refresh on next open.
    fetch(`/api/deals/${deal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outline_doc_id: parsed }),
    }).catch(() => {
      /* non-fatal — doc still loads even if the PATCH fails */
    });

    setDocId(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Step 2: fetch document content whenever docId is resolved ───────────
  useEffect(() => {
    if (!docId) return;

    setLoading(true);
    setError(null);

    fetch(`/api/lighthouse/document?docId=${encodeURIComponent(docId)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg = (body as { error?: string }).error ?? `HTTP ${r.status}`;
          throw new Error(msg);
        }
        return body as { content: string };
      })
      .then(({ content: fetched }) => {
        setContent(fetched ?? "");
        setSavedContent(fetched ?? "");
        setIsDirty(false);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [docId]);

  // ─── Save ─────────────────────────────────────────────────────────────────
  const save = useCallback(
    async (text: string) => {
      if (!docId) return;
      if (text === savedContent) return;

      setSaving(true);
      try {
        const r = await fetch("/api/lighthouse/document", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docId, content: text }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setSavedContent(text);
        setIsDirty(false);
      } catch (err) {
        console.error("Save failed:", err);
      } finally {
        setSaving(false);
      }
    },
    [docId, savedContent]
  );

  function handleChange(value: string) {
    setContent(value);
    setIsDirty(value !== savedContent);
  }

  // ─── Empty state — no Lighthouse doc linked ───────────────────────────────
  if (!deal.lighthouse_url && !deal.outline_doc_id) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <p className="text-sm text-gray-500">
          No Lighthouse document linked. Add a Lighthouse URL to this deal in
          Attio to enable notes sync.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-gray-400">Loading document…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6 gap-2">
        <p className="text-sm text-red-500">
          Failed to load Lighthouse document: {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Lighthouse document</span>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-amber-500">Unsaved changes</span>
          )}
          <button
            onClick={() => save(content)}
            disabled={saving || !isDirty}
            className="text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {saving ? "Saving…" : "Save to Lighthouse"}
          </button>
        </div>
      </div>
      <textarea
        className="flex-1 w-full min-h-[480px] rounded-md border border-gray-200 bg-transparent p-3 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-gray-300"
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Start typing markdown…"
        spellCheck={false}
      />
    </div>
  );
}
