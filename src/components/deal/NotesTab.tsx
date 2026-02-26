"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import { Table as TiptapTable } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import type { MarkdownStorage } from "tiptap-markdown";
import type { Editor } from "@tiptap/core";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Link as LinkIcon,
  Code,
  List,
  ListOrdered,
  Table as TableIcon,
  Trash2,
  Sparkles,
} from "lucide-react";
import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  deal: DealWithArrays;
  enrichedPreview?: string | null;
  onEnrichConsumed?: () => void;
}

const notesCache = new Map<string, { content: string; documentId: string }>();

function getCacheKey(name: string) {
  return name.trim().toLowerCase();
}

function getMarkdown(editor: Editor): string {
  const storage = editor.storage as unknown as { markdown: MarkdownStorage };
  return storage.markdown.getMarkdown();
}

// ── Toolbar button ─────────────────────────────────────────────────────────────
function ToolbarBtn({
  onClick,
  active,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      title={title}
      className={`flex items-center justify-center w-6 h-6 rounded text-xs transition-colors ${
        active
          ? "bg-gray-700 text-white"
          : "text-gray-500 hover:text-gray-800 hover:bg-gray-200"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

// ── Bubble menu button ─────────────────────────────────────────────────────────
function BubbleBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
        active ? "bg-white/20" : "hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <div className="w-px h-4 bg-gray-300 mx-1 shrink-0" />;
const BubbleDivider = () => (
  <div className="w-px h-4 bg-gray-600 mx-0.5 shrink-0" />
);

// ── Main component ─────────────────────────────────────────────────────────────
export function NotesTab({ deal, enrichedPreview, onEnrichConsumed }: Props) {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState("");
  const savedContentRef = useRef("");
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Link input
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Stable ref to editor so async callbacks don't close over a stale value
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    savedContentRef.current = savedContent;
  }, [savedContent]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Highlight.configure({ multicolor: false }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      TiptapTable.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: "Type here…" }),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: "-",
        transformPastedText: true,
      }),
    ],
    content: "",
    onUpdate: ({ editor: ed }) => {
      const md = getMarkdown(ed);
      setIsDirty(md !== savedContentRef.current);
    },
    editorProps: {
      attributes: {
        class: "notes-markdown min-h-[480px] w-full p-5 focus:outline-none",
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  // Ref so loadNotes (useCallback []) can read the current value without stale closure
  const hasEnrichedPreviewRef = useRef(false);
  useEffect(() => {
    hasEnrichedPreviewRef.current = !!enrichedPreview;
  }, [enrichedPreview]);

  // Load enriched preview into editor — also depends on `editor` so it retries
  // if the editor wasn't ready yet when enrichedPreview first arrived
  useEffect(() => {
    if (!enrichedPreview || !editor) return;
    editor.commands.setContent(enrichedPreview);
  }, [enrichedPreview, editor]);

  // ── Load ──────────────────────────────────────────────────────────────────────
  const loadNotes = useCallback(
    async (companyName: string, forcePull: boolean) => {
      const key = getCacheKey(companyName);

      if (!forcePull) {
        const cached = notesCache.get(key);
        if (cached) {
          // If an enriched preview is active, update metadata but don't touch editor content
          if (!hasEnrichedPreviewRef.current) {
            editorRef.current?.commands.setContent(cached.content);
            setIsDirty(false);
          }
          setSavedContent(cached.content);
          savedContentRef.current = cached.content;
          setDocumentId(cached.documentId);
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
          throw new Error(
            (body as { error?: string }).error ?? `HTTP ${r.status}`
          );
        }
        const { content: fetched, documentId: docId } = body as {
          content: string;
          documentId: string;
        };
        const text = fetched ?? "";
        // If an enriched preview is active, update metadata but don't touch editor content
        if (!hasEnrichedPreviewRef.current) {
          editorRef.current?.commands.setContent(text);
          setIsDirty(false);
        }
        setSavedContent(text);
        savedContentRef.current = text;
        setDocumentId(docId ?? null);
        notesCache.set(key, { content: text, documentId: docId ?? "" });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const companyName = deal.company_name?.trim();
    if (!companyName || !editor) return;
    loadNotes(companyName, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.company_name, editor]);

  // ── Save ──────────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed || !documentId) return;
    const md = getMarkdown(ed);
    if (md === savedContentRef.current) return;

    setSaving(true);
    try {
      const r = await fetch("/api/lighthouse/document", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId: documentId, content: md }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSavedContent(md);
      savedContentRef.current = md;
      setIsDirty(false);
      onEnrichConsumed?.();
      const companyName = deal.company_name?.trim();
      if (companyName) {
        notesCache.set(getCacheKey(companyName), { content: md, documentId });
      }
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  }, [documentId, deal.company_name]);

  // ── Link helpers ──────────────────────────────────────────────────────────────
  function toggleLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      setShowLinkInput(false);
    } else {
      const existingHref: string = editor.getAttributes("link").href ?? "";
      setLinkUrl(existingHref);
      setShowLinkInput(true);
      setTimeout(() => linkInputRef.current?.focus(), 50);
    }
  }

  function applyLink() {
    const raw = linkUrl.trim();
    if (raw) {
      const href =
        raw.startsWith("http://") || raw.startsWith("https://")
          ? raw
          : `https://${raw}`;
      editor?.chain().focus().setLink({ href }).run();
    } else {
      editor?.chain().focus().unsetLink().run();
    }
    setShowLinkInput(false);
    setLinkUrl("");
  }

  function handleLinkKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      applyLink();
    } else if (e.key === "Escape") {
      setShowLinkInput(false);
      setLinkUrl("");
      editor?.chain().focus().run();
    }
  }

  const inTable = editor?.isActive("table") ?? false;

  // ── Early returns ─────────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-0 h-full">
      {/* ── Fixed toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border border-gray-200 rounded-t-md bg-gray-50 px-2 py-1.5 gap-2 flex-wrap">
        <div className="flex items-center gap-0.5 flex-wrap">
          {/* Inline formatting */}
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive("bold")}
            title="Bold (Ctrl+B)"
          >
            <Bold size={13} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive("italic")}
            title="Italic (Ctrl+I)"
          >
            <Italic size={13} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            active={editor?.isActive("underline")}
            title="Underline (Ctrl+U)"
          >
            <UnderlineIcon size={13} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            active={editor?.isActive("strike")}
            title="Strikethrough"
          >
            <Strikethrough size={13} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleHighlight().run()}
            active={editor?.isActive("highlight")}
            title="Highlight"
          >
            <Highlighter size={13} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={toggleLink}
            active={editor?.isActive("link") || showLinkInput}
            title="Link"
          >
            <LinkIcon size={13} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleCode().run()}
            active={editor?.isActive("code")}
            title="Inline code"
          >
            <Code size={13} />
          </ToolbarBtn>

          <Divider />

          {/* Headings */}
          <ToolbarBtn
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level: 1 }).run()
            }
            active={editor?.isActive("heading", { level: 1 })}
            title="Heading 1"
          >
            <span className="font-bold text-[10px] leading-none">H1</span>
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level: 2 }).run()
            }
            active={editor?.isActive("heading", { level: 2 })}
            title="Heading 2"
          >
            <span className="font-bold text-[10px] leading-none">H2</span>
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level: 3 }).run()
            }
            active={editor?.isActive("heading", { level: 3 })}
            title="Heading 3"
          >
            <span className="font-bold text-[10px] leading-none">H3</span>
          </ToolbarBtn>

          <Divider />

          {/* Lists */}
          <ToolbarBtn
            onClick={() =>
              editor?.chain().focus().toggleBulletList().run()
            }
            active={editor?.isActive("bulletList")}
            title="Bullet list"
          >
            <List size={13} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() =>
              editor?.chain().focus().toggleOrderedList().run()
            }
            active={editor?.isActive("orderedList")}
            title="Numbered list"
          >
            <ListOrdered size={13} />
          </ToolbarBtn>

          <Divider />

          {/* Table */}
          <ToolbarBtn
            onClick={() =>
              editor
                ?.chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
            title="Insert table"
            disabled={inTable}
          >
            <TableIcon size={13} />
          </ToolbarBtn>

          {/* Table controls — visible only when cursor is inside a table */}
          {inTable && (
            <>
              <Divider />
              <ToolbarBtn
                onClick={() => editor?.chain().focus().addRowAfter().run()}
                title="Add row below"
              >
                <span className="text-[9px] font-semibold">+Row</span>
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().deleteRow().run()}
                title="Delete row"
              >
                <span className="text-[9px] font-semibold">−Row</span>
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() =>
                  editor?.chain().focus().addColumnAfter().run()
                }
                title="Add column after"
              >
                <span className="text-[9px] font-semibold">+Col</span>
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().deleteColumn().run()}
                title="Delete column"
              >
                <span className="text-[9px] font-semibold">−Col</span>
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().deleteTable().run()}
                title="Delete table"
              >
                <Trash2 size={11} />
              </ToolbarBtn>
            </>
          )}
        </div>

        {/* Sync controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 hidden sm:inline">
            Lighthouse
          </span>
          <button
            type="button"
            onClick={() => {
              const name = deal.company_name?.trim();
              if (name) loadNotes(name, true);
            }}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Pull
          </button>
          {isDirty && (
            <span className="text-xs text-amber-500">Unsaved</span>
          )}
          <button
            onClick={save}
            disabled={saving || !documentId}
            className="text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {saving ? "Pushing…" : "Push"}
          </button>
        </div>
      </div>

      {/* ── Enriched preview banner ────────────────────────────────────────────── */}
      {enrichedPreview && (
        <div className="flex items-center justify-between gap-3 border-x border-b border-amber-200 bg-amber-50 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={13} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-800">
              Enriched draft loaded — review and edit, then <strong>Push</strong> to save to Lighthouse.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const name = deal.company_name?.trim();
              if (name) loadNotes(name, true);
              onEnrichConsumed?.();
            }}
            className="text-xs text-amber-600 hover:text-amber-800 shrink-0 underline underline-offset-2"
          >
            Discard
          </button>
        </div>
      )}

      {/* ── Link URL input bar ─────────────────────────────────────────────────── */}
      {showLinkInput && (
        <div className="flex items-center gap-2 border-x border-b border-gray-200 bg-white px-3 py-1.5">
          <LinkIcon size={12} className="text-gray-400 shrink-0" />
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={handleLinkKeyDown}
            placeholder="Paste URL and press Enter…"
            className="flex-1 text-xs outline-none text-gray-700 placeholder:text-gray-400 bg-transparent"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={applyLink}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLinkInput(false);
              setLinkUrl("");
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Editor ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto border-x border-b border-gray-200 rounded-b-md bg-white relative">
        {/* Floating bubble menu — appears when text is selected */}
        {editor && (
          <BubbleMenu
            editor={editor}
            shouldShow={({ state }) => {
              return !state.selection.empty && !showLinkInput;
            }}
          >
            <div className="flex items-center gap-0.5 bg-gray-900 rounded-lg shadow-xl px-1.5 py-1.5 border border-gray-700">
              <BubbleBtn
                onClick={() => editor.chain().focus().toggleBold().run()}
                active={editor.isActive("bold")}
                title="Bold"
              >
                <Bold size={13} className="text-gray-100" />
              </BubbleBtn>
              <BubbleBtn
                onClick={() => editor.chain().focus().toggleItalic().run()}
                active={editor.isActive("italic")}
                title="Italic"
              >
                <Italic size={13} className="text-gray-100" />
              </BubbleBtn>
              <BubbleBtn
                onClick={() =>
                  editor.chain().focus().toggleUnderline().run()
                }
                active={editor.isActive("underline")}
                title="Underline"
              >
                <UnderlineIcon size={13} className="text-gray-100" />
              </BubbleBtn>
              <BubbleBtn
                onClick={() => editor.chain().focus().toggleStrike().run()}
                active={editor.isActive("strike")}
                title="Strikethrough"
              >
                <Strikethrough size={13} className="text-gray-100" />
              </BubbleBtn>
              <BubbleDivider />
              <BubbleBtn
                onClick={() =>
                  editor.chain().focus().toggleHighlight().run()
                }
                active={editor.isActive("highlight")}
                title="Highlight"
              >
                <Highlighter size={13} className="text-gray-100" />
              </BubbleBtn>
              <BubbleBtn
                onClick={toggleLink}
                active={editor.isActive("link")}
                title="Link"
              >
                <LinkIcon size={13} className="text-gray-100" />
              </BubbleBtn>
              <BubbleDivider />
              <BubbleBtn
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 1 }).run()
                }
                active={editor.isActive("heading", { level: 1 })}
                title="Heading 1"
              >
                <span className="text-[10px] font-bold text-gray-100 leading-none">
                  H1
                </span>
              </BubbleBtn>
              <BubbleBtn
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
                active={editor.isActive("heading", { level: 2 })}
                title="Heading 2"
              >
                <span className="text-[10px] font-bold text-gray-100 leading-none">
                  H2
                </span>
              </BubbleBtn>
            </div>
          </BubbleMenu>
        )}

        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
