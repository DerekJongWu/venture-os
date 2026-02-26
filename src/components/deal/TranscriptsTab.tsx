"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, ChevronLeft, AlertTriangle, Sparkles, Trash2 } from "lucide-react";
import type { DealWithArrays } from "@/lib/deal-utils";

interface TranscriptRecord {
  id: string;
  raw_text: string;
  processed: boolean;
  summary: string | null;
  created_at: string;
}

interface Props {
  deal: DealWithArrays;
  onPatchDeal: (id: string, fields: Partial<DealWithArrays>) => Promise<void>;
  onEnrichComplete?: (content: string) => void;
}

// ─── Streaming helper ─────────────────────────────────────────────────────────

async function streamAI(
  url: string,
  body: Record<string, unknown>,
  onChunk: (text: string) => void
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(text || `HTTP ${res.status}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}

// ─── Add Transcript Modal ─────────────────────────────────────────────────────

function AddTranscriptModal({
  dealId,
  onClose,
  onComplete,
}: {
  dealId: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamedOutput, setStreamedOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!text.trim()) return;
    setLoading(true);
    setStreamedOutput("");
    setError(null);
    try {
      await streamAI(
        "/api/ai/process-transcript",
        { dealId, transcriptText: text },
        (chunk) => setStreamedOutput((prev) => prev + chunk)
      );
      setDone(true);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process transcript");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Add Transcript</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!streamedOutput && !done && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste raw transcript text here…"
              rows={14}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={loading}
            />
          )}

          {streamedOutput && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                AI Summary {done ? "(complete)" : "(generating…)"}
              </p>
              <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-4 font-sans leading-relaxed max-h-[50vh] overflow-y-auto">
                {streamedOutput}
                {loading && <span className="animate-pulse">▌</span>}
              </pre>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          {done ? (
            <Button size="sm" onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={loading || !text.trim()}
              >
                {loading ? "Processing…" : "Submit Transcript"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Transcript detail view ───────────────────────────────────────────────────

function TranscriptDetail({
  transcript,
  onBack,
  onDelete,
}: {
  transcript: TranscriptRecord;
  onBack: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"summary" | "raw">("summary");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await onDelete(transcript.id);
    onBack();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
          >
            <ChevronLeft size={15} />
            Back
          </button>
          <span className="text-sm text-gray-400">
            {new Date(transcript.created_at).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
          title="Delete transcript"
        >
          <Trash2 size={13} />
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>

      <div className="flex gap-3 mb-4 border-b border-gray-200">
        {(["summary", "raw"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 text-sm border-b-2 transition-colors capitalize ${
              tab === t
                ? "border-blue-600 text-blue-600 font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "raw" ? "Raw Transcript" : "Summary"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "summary" ? (
          transcript.summary ? (
            <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
              {transcript.summary}
            </pre>
          ) : (
            <p className="text-sm text-gray-400">No summary generated yet.</p>
          )
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-gray-600 font-mono leading-relaxed bg-gray-50 border border-gray-200 rounded-lg p-4">
            {transcript.raw_text}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TranscriptsTab({ deal, onPatchDeal, onEnrichComplete }: Props) {
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichOutput, setEnrichOutput] = useState("");
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [showEnrichConfirm, setShowEnrichConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // needs_enrichment is now a real field on deal after schema regen
  const needsEnrichment = (deal as unknown as { needs_enrichment: boolean }).needs_enrichment;

  async function deleteTranscript(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/transcripts?id=${id}`, { method: "DELETE" });
      setTranscripts((prev) => prev.filter((t) => t.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function loadTranscripts() {
    setLoadingList(true);
    try {
      const res = await fetch(`/api/transcripts?dealId=${deal.id}`);
      if (res.ok) setTranscripts(await res.json());
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadTranscripts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id]);

  function handleTranscriptAdded() {
    loadTranscripts();
    onPatchDeal(deal.id, { needs_enrichment: true } as Partial<DealWithArrays>);
  }

  async function handleEnrich() {
    setShowEnrichConfirm(false);
    setEnriching(true);
    setEnrichOutput("");
    setEnrichError(null);
    let fullContent = "";
    try {
      await streamAI(
        "/api/ai/enrich-notes",
        { dealId: deal.id },
        (chunk) => {
          fullContent += chunk;
          setEnrichOutput((prev) => prev + chunk);
        }
      );
      onPatchDeal(deal.id, { needs_enrichment: false } as Partial<DealWithArrays>);
      onEnrichComplete?.(fullContent);
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  }

  const selected = transcripts.find((t) => t.id === selectedId);

  if (selected) {
    return (
      <TranscriptDetail transcript={selected} onBack={() => setSelectedId(null)} onDelete={deleteTranscript} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Transcripts</h3>
        <Button size="sm" onClick={() => setShowModal(true)} className="gap-1.5">
          <Plus size={14} />
          Add Transcript
        </Button>
      </div>

      {/* Enrich banner */}
      <div className="flex flex-col gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-700">Enrich Lighthouse Notes</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {needsEnrichment
                ? "New transcripts are ready to be incorporated into the Lighthouse doc."
                : "Lighthouse doc is up to date."}
            </p>
          </div>
          <Button
            size="sm"
            variant={needsEnrichment ? "default" : "outline"}
            disabled={!needsEnrichment || enriching}
            onClick={() => setShowEnrichConfirm(true)}
            className="gap-1.5 shrink-0"
          >
            <Sparkles size={13} />
            {enriching ? "Enriching…" : "Enrich Notes"}
          </Button>
        </div>

        {enrichOutput && (
          <pre className="whitespace-pre-wrap text-xs text-gray-700 bg-white border border-gray-200 rounded p-3 font-sans leading-relaxed max-h-48 overflow-y-auto">
            {enrichOutput}
            {enriching && <span className="animate-pulse">▌</span>}
          </pre>
        )}
        {enrichError && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertTriangle size={12} /> {enrichError}
          </p>
        )}
      </div>

      {/* List */}
      {loadingList ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : transcripts.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          No transcripts yet. Add one to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {transcripts.map((t) => (
            <div
              key={t.id}
              className="group relative w-full text-left p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => setSelectedId(t.id)}
            >
              <button
                onClick={(e) => { e.stopPropagation(); deleteTranscript(t.id); }}
                disabled={deletingId === t.id}
                className="absolute right-2 top-2 p-1 rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                title="Delete transcript"
              >
                <Trash2 size={13} />
              </button>
              <p className="text-xs text-gray-400 mb-1">
                {new Date(t.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {!t.processed && (
                  <span className="ml-2 text-amber-500">• processing</span>
                )}
              </p>
              <p className="text-sm text-gray-700 line-clamp-2 pr-6">
                {(t.summary ?? t.raw_text).slice(0, 180)}…
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {showModal && (
        <AddTranscriptModal
          dealId={deal.id}
          onClose={() => setShowModal(false)}
          onComplete={handleTranscriptAdded}
        />
      )}

      {/* Enrich confirmation dialog */}
      {showEnrichConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <p className="text-sm font-semibold text-gray-900">Generate enriched draft?</p>
            <p className="text-sm text-gray-500">
              An AI-enriched version of the Lighthouse doc will be generated from all
              transcript insights and opened in the Notes tab for you to review and edit
              before pushing to Lighthouse.
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowEnrichConfirm(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleEnrich}>
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
