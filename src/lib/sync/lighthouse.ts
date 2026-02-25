// ─── Lighthouse (Outline) sync helpers ───────────────────────────────────────
//
// Compatible with Vortiago mcp-outline and fan-wen fork (SSE + header auth):
// https://github.com/Vortiago/mcp-outline  https://github.com/fan-wen/mcp-outline
// Tool names: read_document(document_id), update_document(…), search_documents(query).
//
// All MCP calls use header auth: Authorization: Bearer <OUTLINE_API_TOKEN>.
// - If OUTLINE_MCP_ENDPOINT is .../sse (SSE transport), we POST to .../messages.
// - If you use Streamable HTTP with .../mcp, set endpoint to .../mcp or set
//   OUTLINE_MCP_POST_PATH=mcp to force POST path.
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
 * Resolve the URL we use for POST (JSON-RPC tools/call).
 * - fan-wen / Vortiago with MCP_TRANSPORT=sse: GET /sse, POST /messages. We POST to /messages.
 * - Streamable HTTP: POST to /mcp. Set OUTLINE_MCP_ENDPOINT to .../mcp or OUTLINE_MCP_POST_PATH=mcp.
 * - Optional: OUTLINE_MCP_POST_PATH=messages or mcp to force the path (overrides /sse → /messages).
 */
function getMCPPostEndpoint(): string {
  const endpoint = process.env.OUTLINE_MCP_ENDPOINT?.trim();
  if (!endpoint) throw new Error("OUTLINE_MCP_ENDPOINT not configured");
  const forcePath = process.env.OUTLINE_MCP_POST_PATH?.trim().toLowerCase();
  try {
    const u = new URL(endpoint);
    if (forcePath === "mcp" || forcePath === "messages") {
      u.pathname = `/${forcePath}`;
      return u.toString();
    }
    if (u.pathname === "/sse") {
      u.pathname = "/messages";
      return u.toString();
    }
    return endpoint;
  } catch {
    return endpoint;
  }
}

/**
 * Send a JSON-RPC 2.0 tools/call request to the Outline MCP server.
 * All requests use header auth: Authorization: Bearer <OUTLINE_API_TOKEN>.
 * POST target is derived from OUTLINE_MCP_ENDPOINT (e.g. .../sse → .../messages for SSE).
 * Returns the concatenated text from the response content blocks.
 */
async function callMCP(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const endpoint = getMCPPostEndpoint();
  const token = process.env.OUTLINE_API_TOKEN;
  if (!token) throw new Error("OUTLINE_API_TOKEN not configured");

  const id = ++_callId;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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
 * Fetch document content by company name: search_documents(companyName) → get doc ID → read_document(docId).
 * Returns content and documentId (so the client can use documentId for save).
 * Throws if no document is found for the company.
 */
export async function fetchDocumentByCompanyName(
  companyName: string
): Promise<{ content: string; documentId: string }> {
  const trimmed = companyName?.trim();
  if (!trimmed) throw new Error("Company name is required");

  const stubs = await searchDocuments(trimmed);
  if (!stubs.length) {
    throw new Error(`No document found in Lighthouse for "${trimmed}"`);
  }

  const documentId = stubs[0].id;
  const content = await fetchDocument(documentId);
  return { content, documentId };
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
