// ─── Lighthouse (Outline) sync helpers ───────────────────────────────────────
//
// fetchDocument(docId)        Fetch full markdown content of an Outline doc.
// updateDocument(docId, text) Overwrite full content of an Outline doc.
// appendToDocument(docId, md) Append a markdown block to the end of a doc.
// searchDocuments(query)      Search Lighthouse; return lightweight doc stubs.
//
// All calls go through the self-hosted Outline MCP server at
// process.env.OUTLINE_MCP_ENDPOINT, authenticated with OUTLINE_API_TOKEN.
//
// The app never creates Outline documents — docs originate externally.

export interface OutlineDocStub {
  id: string;
  title: string;
  url: string;
}

// ─── MCP transport ────────────────────────────────────────────────────────────

let _callId = 0;

/**
 * Send a JSON-RPC 2.0 tools/call request to the Outline MCP server.
 * Returns the concatenated text from the response content blocks.
 */
async function callMCP(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const endpoint = process.env.OUTLINE_MCP_ENDPOINT;
  if (!endpoint) throw new Error("OUTLINE_MCP_ENDPOINT not configured");

  const id = ++_callId;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OUTLINE_API_TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Outline MCP "${toolName}" failed: HTTP ${res.status} — ${body.slice(0, 300)}`
    );
  }

  const json = await res.json();

  if (json.error) {
    throw new Error(
      `Outline MCP "${toolName}" error: ${
        json.error.message ?? JSON.stringify(json.error)
      }`
    );
  }

  // MCP tool results are arrays of typed content blocks.
  // Concatenate all text blocks into a single string.
  const content: Array<{ type: string; text?: string }> =
    json.result?.content ?? [];

  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch the full markdown content of an Outline document by ID.
 * Uses read_document(document_id) per Outline MCP (e.g. Vortiago mcp-outline).
 * Always fetches live — never served from local cache.
 */
export async function fetchDocument(docId: string): Promise<string> {
  return callMCP("read_document", { document_id: docId });
}

/**
 * Overwrite the full content of an Outline document.
 * Uses update_document(document_id, text) per Outline MCP.
 * Used when the user saves edits in the Notes tab.
 */
export async function updateDocument(
  docId: string,
  content: string
): Promise<void> {
  await callMCP("update_document", { document_id: docId, text: content });
}

/**
 * Append a markdown block to the end of an Outline document.
 * Uses update_document(..., append: true) when supported, otherwise fetch → concat → update.
 */
export async function appendToDocument(
  docId: string,
  block: string
): Promise<void> {
  const trimmed = block.trim();
  if (!trimmed) return;
  try {
    await callMCP("update_document", {
      document_id: docId,
      text: trimmed,
      append: true,
    });
  } catch {
    const current = await fetchDocument(docId);
    const updated = current.trimEnd() + "\n\n" + trimmed;
    await updateDocument(docId, updated);
  }
}

/**
 * Search Lighthouse for documents matching the query.
 * Uses search_documents(query) per Outline MCP. Returns lightweight doc stubs.
 */
export async function searchDocuments(
  query: string
): Promise<OutlineDocStub[]> {
  const raw = await callMCP("search_documents", { query });

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as OutlineDocStub[];
    const data = (parsed as Record<string, unknown>).data;
    if (Array.isArray(data)) return data as OutlineDocStub[];
    return [];
  } catch {
    return [];
  }
}
