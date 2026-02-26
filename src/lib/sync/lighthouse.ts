// ─── Lighthouse (Outline) sync helpers ───────────────────────────────────────
//
// Compatible with fan-wen/mcp-outline (SSE transport + header auth):
// https://github.com/fan-wen/mcp-outline
// Tool names: read_document(document_id), update_document(…), search_documents(query).
//
// SSE transport protocol (fan-wen / FastMCP):
//   1. GET /sse → server sends "event: endpoint\ndata: /messages/?session_id=<id>"
//   2. POST to /messages/?session_id=<id> with JSON-RPC (initialize, then tools/call)
//   3. Server sends "event: message\ndata: <json-rpc-response>" over the SSE stream
//
// The SSE stream is opened with Node.js https.request() — NOT fetch() — because
// Next.js App Router's patched fetch buffers streaming responses before yielding
// them to application code, which makes reader.read() hang indefinitely for SSE.
//
// The app never creates Outline documents — docs originate externally.

import * as https from "https";
import * as http from "http";
import type { ClientRequest, IncomingMessage } from "http";

export interface OutlineDocStub {
  id: string;
  title: string;
  url: string;
}

// ─── SSE stream helpers ───────────────────────────────────────────────────────

/**
 * Simple async queue for SSE data payloads.
 * Buffers incoming events and resolves pending next() calls immediately.
 */
class SseQueue {
  private buffer: string[] = [];
  private waiter: { resolve: (v: string) => void; reject: (e: Error) => void } | null = null;
  private closedWith: Error | null = null;

  push(data: string) {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.resolve(data);
    } else {
      this.buffer.push(data);
    }
  }

  close(err?: Error) {
    this.closedWith = err ?? new Error("SSE stream closed");
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.reject(this.closedWith);
    }
  }

  next(): Promise<string> {
    if (this.buffer.length > 0) return Promise.resolve(this.buffer.shift()!);
    if (this.closedWith) return Promise.reject(this.closedWith);
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }
}

/**
 * Open an SSE connection using Node.js https.request() (bypasses Next.js fetch patches).
 * Returns the queue that receives incoming SSE data payloads and a close() function.
 */
function openSseStream(
  sseEndpoint: string,
  token: string
): Promise<{ queue: SseQueue; req: ClientRequest }> {
  return new Promise((resolve, reject) => {
    const u = new URL(sseEndpoint);
    const mod = (u.protocol === "https:" ? https : http) as typeof https;
    const queue = new SseQueue();

    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port ? parseInt(u.port) : u.protocol === "https:" ? 443 : 80,
        path: u.pathname + (u.search ?? ""),
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
      },
      (res: IncomingMessage) => {
        console.log(`[SSE] response status=${res.statusCode} headers=`, res.headers);

        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`SSE connect failed: HTTP ${res.statusCode}`));
          return;
        }

        // If Cloudflare redirects the SSE GET (e.g. http→https or trailing slash),
        // follow manually since https.request doesn't auto-follow redirects.
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume(); // drain the redirect body so the socket can be reused
          reject(
            new Error(
              `SSE connect got redirect ${res.statusCode} → ${res.headers.location}`
            )
          );
          return;
        }

        // Resolve as soon as response headers arrive — data comes via queue
        resolve({ queue, req });

        let buf = "";
        res.on("data", (chunk: Buffer) => {
          const raw = chunk.toString("utf8");
          console.log(`[SSE] data chunk (${chunk.length}b): ${raw.slice(0, 120)}`);
          // Normalize CRLF → LF so the split works regardless of server line-ending style
          const text = raw.replace(/\r\n/g, "\n");
          buf += text;
          // Split on double-newline (SSE event boundary)
          const blocks = buf.split("\n\n");
          buf = blocks.pop() ?? ""; // keep potentially incomplete last block
          for (const block of blocks) {
            const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
            if (dataLine) queue.push(dataLine.slice(5).trim());
          }
        });

        res.on("end", () => {
          console.log("[SSE] stream ended");
          queue.close();
        });
        res.on("error", (e) => {
          console.log("[SSE] stream error:", e);
          queue.close(e instanceof Error ? e : new Error(String(e)));
        });

        // Explicitly resume in case the stream didn't auto-switch to flowing mode
        res.resume();
      }
    );

    req.on("error", reject);
    req.end();
  });
}

// ─── MCP transport ────────────────────────────────────────────────────────────

/**
 * Send a JSON-RPC 2.0 tools/call to the Outline MCP server via SSE transport.
 *
 * Per-call protocol (fan-wen mcp-outline, MCP_TRANSPORT=sse):
 *   1. Open SSE stream (https.request GET /sse) → buffer events in SseQueue.
 *   2. Read endpoint event from queue → session POST URL.
 *   3. POST initialize → wait for initialize response via queue.
 *   4. POST notifications/initialized (fire-and-forget).
 *   5. POST tools/call → wait for tool response via queue.
 *   6. Close SSE stream.
 *
 * Auth: Authorization: Bearer <OUTLINE_API_TOKEN> on SSE GET and all POSTs.
 * Timeout: 30 s total.
 */
async function callMCP(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const sseEndpoint = process.env.OUTLINE_MCP_ENDPOINT?.trim();
  if (!sseEndpoint) throw new Error("OUTLINE_MCP_ENDPOINT not configured");
  const token = process.env.OUTLINE_API_TOKEN?.trim();
  if (!token) throw new Error("OUTLINE_API_TOKEN not configured");

  const origin = new URL(sseEndpoint).origin;

  // Overall 30-second deadline
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`MCP "${toolName}" timed out after 30s`)),
      30_000
    );
  });

  async function run(): Promise<string> {
    // ── 1. Open SSE stream ───────────────────────────────────────────────────
    console.log(`[MCP] opening SSE stream for ${toolName}`);
    const { queue, req } = await openSseStream(sseEndpoint!, token!);
    console.log(`[MCP] SSE stream opened`);

    try {
      // ── 2. Read endpoint event ─────────────────────────────────────────────
      let postUrl = "";
      while (!postUrl) {
        const data = await queue.next();
        console.log(`[MCP] endpoint event data: ${data.slice(0, 80)}`);
        if (data.startsWith("/messages")) {
          postUrl = `${origin}${data}`;
        } else if (data.startsWith("http")) {
          postUrl = data;
        }
      }
      console.log(`[MCP] postUrl: ${postUrl}`);

      // Helper: POST JSON-RPC and wait for SSE message with matching id
      const postAndWait = async (
        id: number,
        method: string,
        params: unknown
      ): Promise<Record<string, unknown>> => {
        console.log(`[MCP] POST ${method} (id=${id})`);
        const postResp = await fetch(postUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          // @ts-ignore — Next.js fetch extension
          cache: "no-store",
        });
        console.log(`[MCP] POST ${method} → HTTP ${postResp.status}`);
        // Read from the SSE queue until we see the matching JSON-RPC response id
        while (true) {
          const data = await queue.next();
          console.log(`[MCP] SSE data (waiting for id=${id}): ${data.slice(0, 120)}`);
          let json: Record<string, unknown>;
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }
          if (json.id === id) return json;
        }
      };

      // ── 3. MCP initialize handshake ────────────────────────────────────────
      const initResp = await postAndWait(1, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "deal-flow", version: "1.0" },
      });
      if (initResp.error) {
        const e = initResp.error as { message?: string };
        throw new Error(
          `MCP initialize failed: ${e.message ?? JSON.stringify(initResp.error)}`
        );
      }
      console.log(`[MCP] initialize OK`);

      // ── 4. notifications/initialized (fire-and-forget) ────────────────────
      fetch(postUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        }),
        // @ts-ignore
        cache: "no-store",
      }).catch(() => {});

      // ── 5. tools/call ─────────────────────────────────────────────────────
      const toolResp = await postAndWait(2, "tools/call", {
        name: toolName,
        arguments: args,
      });
      console.log(`[MCP] tools/call ${toolName} OK`);

      if (toolResp.error) {
        const e = toolResp.error as { message?: string };
        throw new Error(
          `MCP "${toolName}" error: ${e.message ?? JSON.stringify(toolResp.error)}`
        );
      }

      const content: Array<{ type: string; text?: string }> =
        (
          toolResp.result as {
            content?: Array<{ type: string; text?: string }>;
          }
        )?.content ?? [];

      return content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");
    } finally {
      req.destroy();
    }
  }

  try {
    return await Promise.race([run(), deadline]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Outline expects document_id to be a UUID or a slug (e.g. doc URL path segment). Reject URLs and malformed values. */
export function isValidOutlineDocId(id: string | null | undefined): boolean {
  if (!id || typeof id !== "string") return false;
  const t = id.trim();
  if (!t) return false;
  // UUID (with optional hyphens)
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(t)) return true;
  // Slug: alphanumeric and hyphens only, no spaces/slashes (avoids URL path or full URL)
  if (/^[a-zA-Z0-9_-]+$/.test(t) && t.length >= 2 && t.length <= 200) return true;
  return false;
}

/**
 * Fetch the full markdown content of an Outline document by ID.
 * Always fetches live — never served from local cache.
 * Throws if docId is not a valid UUID or slug (Outline returns 400 otherwise).
 */
export async function fetchDocument(docId: string): Promise<string> {
  if (!isValidOutlineDocId(docId)) {
    throw new Error(`Invalid document ID for Outline (expected UUID or slug): ${docId.slice(0, 50)}`);
  }
  const raw = await callMCP("read_document", { document_id: docId });
  // MCP may return error payload as plain text instead of throwing
  if (raw && (raw.trimStart().startsWith('{"ok":false') || /^HTTP [45]\d/.test(raw.trimStart()))) {
    throw new Error(raw.slice(0, 200));
  }
  return raw;
}

/**
 * Pick the best-matching document when search returns multiple results.
 * Prefers a document whose title equals (or closely matches) the company name,
 * e.g. a doc titled "Nametag" for company "Nametag" over "DD Room Analysis"
 * that only mentions Nametag in passing.
 */
function pickBestDocumentByCompanyName(
  stubs: OutlineDocStub[],
  companyName: string
): OutlineDocStub {
  const normalized = companyName.trim().toLowerCase();
  if (!normalized) return stubs[0];

  // Exact title match (case-insensitive)
  const exact = stubs.find(
    (s) => s.title.trim().toLowerCase() === normalized
  );
  if (exact) return exact;

  // Title equals company name with minor punctuation/whitespace differences
  const titleNorm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");
  const companyNorm = titleNorm(companyName);
  const startsWith = stubs.find(
    (s) => titleNorm(s.title) === companyNorm || titleNorm(s.title).startsWith(companyNorm)
  );
  if (startsWith) return startsWith;

  // Title contains company name (e.g. "Nametag - DD Notes")
  const contains = stubs.find(
    (s) => titleNorm(s.title).includes(companyNorm) || companyNorm.includes(titleNorm(s.title))
  );
  if (contains) return contains;

  return stubs[0];
}

/**
 * Fetch document content by company name: search_documents → read_document.
 * When multiple documents match, prefers one whose title matches the company name
 * (e.g. "Nametag" doc for company "Nametag") over docs that only mention the company.
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

  const best = pickBestDocumentByCompanyName(stubs, trimmed);
  const content = await fetchDocument(best.id);
  return { content, documentId: best.id };
}

/**
 * Overwrite the full content of an Outline document.
 * Used when the user saves edits in the Notes tab.
 */
export async function updateDocument(
  docId: string,
  content: string
): Promise<void> {
  if (!isValidOutlineDocId(docId)) {
    throw new Error(`Invalid document ID for Outline (expected UUID or slug): ${String(docId).slice(0, 50)}`);
  }
  await callMCP("update_document", { document_id: docId, text: content });
}

/**
 * Append a markdown block to the end of an Outline document.
 * Tries update_document with append:true; falls back to fetch→concat→update.
 */
export async function appendToDocument(
  docId: string,
  block: string
): Promise<void> {
  if (!isValidOutlineDocId(docId)) {
    throw new Error(`Invalid document ID for Outline (expected UUID or slug): ${String(docId).slice(0, 50)}`);
  }
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
 *
 * The server returns markdown text in this format:
 *   ## 1. Title
 *   ID: <uuid>
 *   Context: ...
 */
export async function searchDocuments(
  query: string
): Promise<OutlineDocStub[]> {
  const raw = await callMCP("search_documents", { query });

  const results: OutlineDocStub[] = [];
  // Split on "## N." section headers
  const sections = raw.split(/\n## \d+\./).slice(1);
  for (const section of sections) {
    const lines = section.split("\n");
    const title = lines[0].trim();
    const idLine = lines.find((l) => l.startsWith("ID:"));
    if (!idLine || !title) continue;
    const id = idLine.slice(3).trim();
    if (id) results.push({ id, title, url: "" });
  }
  return results;
}