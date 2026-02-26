"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Upload,
  File,
  FileText,
  Trash2,
  Download,
  AlertTriangle,
  Search,
} from "lucide-react";
import type { DealWithArrays } from "@/lib/deal-utils";

interface DataRoomFileRecord {
  id: string;
  deal_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  extracted_text: string | null;
  file_size: number | null;
  uploaded_at: string;
}

interface Props {
  deal: DealWithArrays;
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

// ─── File type helpers ────────────────────────────────────────────────────────

function FileIcon({ type }: { type: string }) {
  if (type === "pdf") return <FileText size={16} className="text-red-500 shrink-0" />;
  if (type === "docx") return <FileText size={16} className="text-blue-500 shrink-0" />;
  if (type === "xlsx") return <FileText size={16} className="text-green-600 shrink-0" />;
  return <File size={16} className="text-gray-400 shrink-0" />;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractionStatus(file: DataRoomFileRecord): {
  label: string;
  className: string;
} {
  if (file.file_type === "xlsx" || file.file_type === "other") {
    return { label: "Preview N/A", className: "bg-gray-100 text-gray-500" };
  }
  if (file.extracted_text) {
    return { label: "Extracted", className: "bg-green-100 text-green-700" };
  }
  return { label: "Failed", className: "bg-red-100 text-red-600" };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DataRoomTab({ deal }: Props) {
  const [files, setFiles] = useState<DataRoomFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingName, setUploadingName] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasExtractedFiles = files.some((f) => f.extracted_text !== null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dataroom?dealId=${deal.id}`);
      if (res.ok) setFiles(await res.json());
    } finally {
      setLoading(false);
    }
  }, [deal.id]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadingName(file.name);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("dealId", deal.id);
      formData.append("file", file);

      const res = await fetch("/api/dataroom/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUploadError((err as { error?: string }).error ?? `Upload failed (${res.status})`);
        return;
      }

      const record: DataRoomFileRecord = await res.json();
      setFiles((prev) => [record, ...prev]);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setUploadingName("");
    }
  }

  async function deleteFile(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/dataroom?id=${id}`, { method: "DELETE" });
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAsk() {
    if (!question.trim() || asking) return;
    setAsking(true);
    setAnswer("");
    setAskError(null);
    try {
      await streamAI(
        "/api/ai/ask-dataroom",
        { dealId: deal.id, question },
        (chunk) => setAnswer((prev) => prev + chunk)
      );
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Failed to get answer");
    } finally {
      setAsking(false);
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    // Upload sequentially to avoid race conditions
    dropped.reduce(
      (chain, f) => chain.then(() => uploadFile(f)),
      Promise.resolve()
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Ask Data Room ── */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">Ask Data Room</h3>

        {!hasExtractedFiles ? (
          <p className="text-xs text-gray-400 py-1">
            Upload files to enable data room Q&amp;A
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !asking) handleAsk();
                }}
                placeholder="Ask a question about the uploaded documents…"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                disabled={asking}
              />
              <Button
                size="sm"
                onClick={handleAsk}
                disabled={asking || !question.trim()}
                className="gap-1.5 shrink-0"
              >
                <Search size={13} />
                {asking ? "Asking…" : "Ask"}
              </Button>
            </div>

            {answer && (
              <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-3 font-sans leading-relaxed max-h-64 overflow-y-auto">
                {answer}
                {asking && <span className="animate-pulse">▌</span>}
              </pre>
            )}

            {askError && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertTriangle size={12} /> {askError}
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Upload zone ── */}
      <div>
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            uploading
              ? "opacity-60 cursor-not-allowed border-gray-200"
              : dragging
              ? "border-blue-400 bg-blue-50 cursor-copy"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer"
          }`}
        >
          <Upload size={20} className="mx-auto mb-2 text-gray-400" />
          <p className="text-sm text-gray-500">
            {uploading
              ? `Uploading ${uploadingName}…`
              : "Drop files here or click to upload"}
          </p>
          <p className="text-xs text-gray-400 mt-1">PDF, DOCX, XLSX and other formats</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = "";
              picked.reduce(
                (chain, f) => chain.then(() => uploadFile(f)),
                Promise.resolve()
              );
            }}
          />
        </div>

        {uploadError && (
          <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
            <AlertTriangle size={12} /> {uploadError}
          </p>
        )}
      </div>

      {/* ── File list ── */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">
          No files uploaded yet.
        </p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => {
            const status = extractionStatus(file);
            return (
              <div
                key={file.id}
                className="group flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <FileIcon type={file.file_type} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {file.file_name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-400">
                      {new Date(file.uploaded_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {file.file_size ? (
                      <span className="text-xs text-gray-400">
                        · {formatSize(file.file_size)}
                      </span>
                    ) : null}
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* Actions: visible on hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <a
                    href={`/api/dataroom/download?id=${file.id}`}
                    download={file.file_name}
                    className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                    title="Download"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download size={13} />
                  </a>
                  <button
                    onClick={() => deleteFile(file.id)}
                    disabled={deletingId === file.id}
                    className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
