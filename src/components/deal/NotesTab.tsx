"use client";

import { useState, useEffect, useCallback } from "react";
import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  deal: DealWithArrays;
}

export function NotesTab({ deal }: Props) {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedContent, setSavedContent] = useState("");

  // Fetch notes by company name: search_documents(companyName) → read_document(docId).
  // API returns { content, documentId }; we store documentId for save.
  useEffect(() => {
    const companyName = deal.company_name?.trim();
    if (!companyName) return;

    setLoading(true);
    setError(null);

    fetch(
      `/api/lighthouse/document?companyName=${encodeURIComponent(companyName)}`
    )
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg = (body as { error?: string }).error ?? `HTTP ${r.status}`;
          throw new Error(msg);
        }
        return body as { content: string; documentId: string };
      })
      .then(({ content: fetched, documentId: docId }) => {
        setContent(fetched ?? "");
        setSavedContent(fetched ?? "");
        setDocumentId(docId ?? null);
        setIsDirty(false);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [deal.company_name]);

  const save = useCallback(
    async (text: string) => {
      if (!documentId) return;
      if (text === savedContent) return;

      setSaving(true);
      try {
        const r = await fetch("/api/lighthouse/document", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docId: documentId, content: text }),
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
    [documentId, savedContent]
  );

  function handleChange(value: string) {
    setContent(value);
    setIsDirty(value !== savedContent);
  }

  if (!deal.company_name?.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <p className="text-sm text-gray-500">
          Company name is required to load notes from Lighthouse.
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
            disabled={saving || !isDirty || !documentId}
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
