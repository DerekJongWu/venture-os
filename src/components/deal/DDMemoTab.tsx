"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, AlertTriangle, RefreshCw, Download, Loader2 } from "lucide-react";
import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  deal: DealWithArrays;
}

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

export function DDMemoTab({ deal }: Props) {
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setOutput("");
    setError(null);
    setDone(false);
    try {
      await streamAI(
        "/api/ai/generate-dd-memo",
        { dealId: deal.id },
        (chunk) => setOutput((prev) => prev + chunk)
      );
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleExportPdf() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/export/dd-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: deal.id, memoContent: output }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DD Memo — ${deal.company_name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const hasOutput = output.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-1">DD Memo</h3>
        <p className="text-xs text-gray-400">
          Generates a comprehensive due diligence memo from all available context.
          The memo is ephemeral — not saved to the database or pushed to Lighthouse.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={generating}
          className="gap-1.5"
        >
          {generating ? (
            <><RefreshCw size={13} className="animate-spin" />Generating…</>
          ) : hasOutput ? (
            <><RefreshCw size={13} />Regenerate</>
          ) : (
            <><FileText size={13} />Generate DD Memo</>
          )}
        </Button>

        {done && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleExportPdf}
            disabled={exporting}
          >
            {exporting
              ? <><Loader2 size={12} className="animate-spin" />Exporting…</>
              : <><Download size={13} />Export as PDF</>}
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertTriangle size={12} /> {error}
        </p>
      )}
      {exportError && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertTriangle size={12} /> Export failed: {exportError}
        </p>
      )}

      {hasOutput && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Memo {done ? "" : "(generating…)"}
          </p>
          <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-white border border-gray-200 rounded-lg p-5 font-sans leading-relaxed">
            {output}
            {generating && <span className="animate-pulse">▌</span>}
          </pre>
        </div>
      )}

      {!hasOutput && !generating && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
          <FileText size={32} className="text-gray-200" />
          <p className="text-sm text-gray-400">
            Click "Generate DD Memo" to create a comprehensive memo<br />
            from all Lighthouse notes, transcripts, and data room files.
          </p>
        </div>
      )}
    </div>
  );
}
