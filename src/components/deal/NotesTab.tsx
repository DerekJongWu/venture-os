"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import TurndownService from "turndown";
import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  deal: DealWithArrays;
}

// Local copy of notes per company. Pull overwrites from Lighthouse; Push sends local → Lighthouse.
const notesCache = new Map<
  string,
  { content: string; documentId: string }
>();

function getCacheKey(companyName: string): string {
  return companyName.trim().toLowerCase();
}

const turndown = new TurndownService({ headingStyle: "atx" });

// GFM-style table: HTML table → markdown with header separator
turndown.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const table = node as HTMLTableElement;
    const rows: string[][] = [];
    const trs = table.querySelectorAll("tr");
    trs.forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll("th, td").forEach((cell) => {
        const text = (cell.textContent ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
        cells.push(text);
      });
      if (cells.length) rows.push(cells);
    });
    if (rows.length === 0) return "";
    const colCount = Math.max(...rows.map((r) => r.length));
    const pad = (arr: string[], n: number) => [...arr, ...Array(Math.max(0, n - arr.length)).fill("")];
    const sep = "| " + Array(colCount).fill("---").join(" | ") + " |";
    const lines = rows.map((r) => "| " + pad(r, colCount).join(" | ") + " |");
    return "\n\n" + lines[0] + "\n" + sep + "\n" + lines.slice(1).join("\n") + "\n\n";
  },
});

function markdownToHtml(md: string): string {
  if (!md.trim()) return "";
  const raw = marked.parse(md, { async: false });
  const html = typeof raw === "string" ? raw : "";
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "strong", "em", "code", "pre", "a", "blockquote", "hr", "table", "thead", "tbody", "tr", "th", "td"] });
}

function htmlToMarkdown(html: string): string {
  if (!html.trim()) return "";
  return turndown.turndown(html).trim();
}

function buildEmptyTableHtml(rows: number, cols: number): string {
  const thead =
    "<thead><tr>" +
    Array(cols).fill("<th></th>").join("") +
    "</tr></thead>";
  const tbody =
    "<tbody>" +
    Array(rows - 1)
      .fill(0)
      .map(() => "<tr>" + Array(cols).fill("<td></td>").join("") + "</tr>")
      .join("") +
    "</tbody>";
  return "<table>" + thead + tbody + "</table>";
}

export function NotesTab({ deal }: Props) {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedContent, setSavedContent] = useState("");
  const editRef = useRef<HTMLDivElement>(null);
  const userIsEditingRef = useRef(false);
  const forceRefreshRef = useRef(false);

  // Sync content (markdown) → contenteditable div when content changes and user isn't editing.
  useEffect(() => {
    if (userIsEditingRef.current || !editRef.current) return;
    const html = markdownToHtml(content);
    editRef.current.innerHTML = html || "<p><br></p>";
  }, [content]);

  // Load notes: use local cache when present; otherwise pull from Lighthouse. "Pull" button always fetches.
  const loadNotes = useCallback(
    async (companyName: string, forcePull: boolean) => {
      const key = getCacheKey(companyName);
      if (!forcePull) {
        const cached = notesCache.get(key);
        if (cached) {
          setContent(cached.content);
          setSavedContent(cached.content);
          setDocumentId(cached.documentId);
          setIsDirty(false);
          setError(null);
          return;
        }
      }

      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/lighthouse/document?companyName=${encodeURIComponent(companyName)}`
        );
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg = (body as { error?: string }).error ?? `HTTP ${r.status}`;
          throw new Error(msg);
        }
        const { content: fetched, documentId: docId } = body as {
          content: string;
          documentId: string;
        };
        const text = fetched ?? "";
        setContent(text);
        setSavedContent(text);
        setDocumentId(docId ?? null);
        setIsDirty(false);
        notesCache.set(key, { content: text, documentId: docId ?? "" });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
        forceRefreshRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    const companyName = deal.company_name?.trim();
    if (!companyName) return;
    loadNotes(companyName, forceRefreshRef.current);
  }, [deal.company_name, loadNotes]);

  const save = useCallback(
    async (textOverride?: string) => {
      if (!documentId) return;
      const toSave = textOverride ?? content;
      if (toSave === savedContent) return;

      setSaving(true);
      try {
        const r = await fetch("/api/lighthouse/document", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docId: documentId, content: toSave }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setContent(toSave);
        setSavedContent(toSave);
        setIsDirty(false);
        const companyName = deal.company_name?.trim();
        if (companyName) {
          const key = getCacheKey(companyName);
          notesCache.set(key, { content: toSave, documentId });
        }
      } catch (err) {
        console.error("Save failed:", err);
      } finally {
        setSaving(false);
      }
    },
    [documentId, content, savedContent, deal.company_name]
  );

  function handlePull() {
    const companyName = deal.company_name?.trim();
    if (!companyName) return;
    forceRefreshRef.current = true;
    loadNotes(companyName, true);
  }

  function handleSaveClick() {
    if (editRef.current) {
      const md = htmlToMarkdown(editRef.current.innerHTML);
      save(md);
    } else {
      save();
    }
  }

  function handlePreviewBlur() {
    if (!editRef.current) return;
    userIsEditingRef.current = false;
    const html = editRef.current.innerHTML;
    const md = htmlToMarkdown(html);
    setContent(md);
    setIsDirty(md !== savedContent);
  }

  function handlePreviewFocus() {
    userIsEditingRef.current = true;
  }

  function insertTableAtCaret(rows: number, cols: number) {
    const el = editRef.current;
    if (!el) return;
    el.focus();
    const tableHtml = buildEmptyTableHtml(rows, cols);
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const fragment = range.createContextualFragment(tableHtml);
      range.insertNode(fragment);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      document.execCommand("insertHTML", false, tableHtml);
    }
    userIsEditingRef.current = true;
    const md = htmlToMarkdown(el.innerHTML);
    setContent(md);
    setIsDirty(md !== savedContent);
  }

  function handlePreviewKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const focusNode = sel.focusNode;
    const cell = focusNode
      ? (focusNode.nodeType === Node.ELEMENT_NODE
          ? (focusNode as Element).closest?.("th, td")
          : focusNode.parentElement?.closest?.("th, td"))
      : null;
    if (!cell) return;
    const table = (cell as HTMLElement).closest?.("table");
    if (!table) return;
    e.preventDefault();
    const cells = Array.from(table.querySelectorAll("th, td"));
    const idx = cells.indexOf(cell as HTMLTableCellElement);
    if (idx < 0) return;
    if (e.shiftKey) {
      const prev = cells[idx - 1] as HTMLTableCellElement | undefined;
      if (prev) {
        const range = document.createRange();
        range.setStart(prev, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {
      const next = cells[idx + 1] as HTMLTableCellElement | undefined;
      if (next) {
        const range = document.createRange();
        range.setStart(next, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        const tbody = table.querySelector("tbody");
        const lastRow = tbody?.querySelectorAll("tr");
        const last = lastRow?.[lastRow.length - 1];
        if (last) {
          const newRow = document.createElement("tr");
          const colCount = last.querySelectorAll("td, th").length;
          for (let i = 0; i < colCount; i++) {
            const td = document.createElement("td");
            newRow.appendChild(td);
          }
          tbody?.appendChild(newRow);
          const firstNew = newRow.querySelector("td");
          if (firstNew) {
            const range = document.createRange();
            range.setStart(firstNew, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }
    }
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-gray-400">Lighthouse document — edit locally, push to sync</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => insertTableAtCaret(2, 3)}
            className="text-xs text-gray-500 hover:text-gray-700"
            title="Insert a 2×3 table at cursor"
          >
            Insert table
          </button>
          <button
            type="button"
            onClick={handlePull}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-700"
            title="Pull latest from Lighthouse"
          >
            Pull from Lighthouse
          </button>
          {isDirty && (
            <span className="text-xs text-amber-500">Unsaved changes</span>
          )}
          <button
            onClick={handleSaveClick}
            disabled={saving || !documentId}
            className="text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {saving ? "Pushing…" : "Push to Lighthouse"}
          </button>
        </div>
      </div>
      <div
        ref={editRef}
        contentEditable
        suppressContentEditableWarning
        className="notes-markdown flex-1 min-h-[480px] w-full overflow-y-auto rounded-md border border-gray-200 bg-white p-5 text-sm text-gray-800 outline-none focus:ring-1 focus:ring-gray-300 [&:empty::before]:content-['Type here...'] [&:empty::before]:text-gray-400"
        onBlur={handlePreviewBlur}
        onFocus={handlePreviewFocus}
        onKeyDown={handlePreviewKeyDown}
      />
    </div>
  );
}
