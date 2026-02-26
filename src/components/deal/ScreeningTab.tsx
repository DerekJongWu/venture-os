"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, AlertTriangle } from "lucide-react";
import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  deal: DealWithArrays & { dataroom_files?: { file_name: string }[] };
  onScreeningComplete?: (content: string) => void;
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

/** Try to extract a URL from deal description or linkedin_founder */
function guessUrl(deal: DealWithArrays): string {
  const urlRegex = /https?:\/\/[^\s,"'<>()[\]]+/i;
  const fromDesc = deal.description?.match(urlRegex)?.[0];
  if (fromDesc) return fromDesc;
  // If linkedin_founder looks like a company URL (not linkedin.com), use it
  const lf = deal.linkedin_founder?.trim();
  if (lf && !lf.includes("linkedin.com")) return lf;
  return "";
}

export function ScreeningTab({ deal, onScreeningComplete }: Props) {
  const [url, setUrl] = useState(() => guessUrl(deal));
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dataRoomFiles = deal.dataroom_files ?? [];
  const hasOutput = output.length > 0;

  async function handleRun() {
    if (!url.trim()) return;
    setRunning(true);
    setOutput("");
    setError(null);
    let fullContent = "";
    try {
      await streamAI(
        "/api/ai/screen-company",
        { dealId: deal.id, url: url.trim() },
        (chunk) => {
          fullContent += chunk;
          setOutput((prev) => prev + chunk);
        }
      );
      onScreeningComplete?.(fullContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screening failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-1">Company Screening</h3>
        <p className="text-xs text-gray-400">
          Fetches the company website and data room materials to fill in the Lighthouse
          note. The draft will open in the Notes tab for review before pushing to Lighthouse.
        </p>
      </div>

      {/* URL input */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          Website URL
        </label>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="pl-8 h-9 text-sm"
            disabled={running}
          />
        </div>
      </div>

      {/* Data room files note */}
      {dataRoomFiles.length > 0 && (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="font-medium mb-1">Data room files included as context:</p>
          <ul className="space-y-0.5">
            {dataRoomFiles.map((f) => (
              <li key={f.file_name} className="text-gray-400">• {f.file_name}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Run button */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleRun}
          disabled={running || !url.trim()}
          className="gap-1.5"
        >
          {running ? "Running…" : hasOutput ? "Re-run Screening" : "Run Screening"}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertTriangle size={12} /> {error}
        </p>
      )}

      {/* Streaming preview */}
      {hasOutput && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Preview {running ? "(generating…)" : "(opening in Notes tab…)"}
          </p>
          <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-4 font-sans leading-relaxed">
            {output}
            {running && <span className="animate-pulse">▌</span>}
          </pre>
        </div>
      )}
    </div>
  );
}
