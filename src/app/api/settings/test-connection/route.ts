// POST /api/settings/test-connection — ping each external service
// Body: { service: "attio" | "outline" | "anthropic" | "harmonic" }

import { NextRequest, NextResponse } from "next/server";

type Service = "attio" | "outline" | "anthropic" | "harmonic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { service?: Service };
  const { service } = body;

  if (!service) {
    return NextResponse.json({ error: "service required" }, { status: 400 });
  }

  try {
    const result = await test(service);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Unknown error" },
      { status: 200 } // 200 so the client can show the error message
    );
  }
}

async function test(service: Service): Promise<{ ok: boolean; message: string }> {
  switch (service) {
    case "attio": {
      const key = process.env.ATTIO_API_KEY;
      if (!key) return { ok: false, message: "ATTIO_API_KEY not set" };
      const res = await fetch("https://api.attio.com/v2/self", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return { ok: true, message: "Connected to Attio" };
      const text = await res.text().catch(() => "");
      return { ok: false, message: `Attio returned ${res.status}: ${text.slice(0, 120)}` };
    }

    case "anthropic": {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return { ok: false, message: "ANTHROPIC_API_KEY not set" };
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return { ok: true, message: "Connected to Anthropic" };
      const json = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return {
        ok: false,
        message: `Anthropic returned ${res.status}: ${json?.error?.message ?? ""}`,
      };
    }

    case "harmonic": {
      const key = process.env.HARMONIC_API_KEY;
      if (!key) return { ok: false, message: "HARMONIC_API_KEY not set" };
      const res = await fetch(
        "https://api.harmonic.ai/search/typeahead?query=test&search_type=COMPANY",
        {
          headers: { apikey: key },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (res.ok) return { ok: true, message: "Connected to Harmonic" };
      return { ok: false, message: `Harmonic returned ${res.status}` };
    }

    case "outline": {
      const token = process.env.OUTLINE_API_TOKEN;
      const endpoint = process.env.OUTLINE_MCP_ENDPOINT;
      if (!token) return { ok: false, message: "OUTLINE_API_TOKEN not set" };
      if (!endpoint) return { ok: false, message: "OUTLINE_MCP_ENDPOINT not set" };
      // Just verify the SSE endpoint responds — don't open a full MCP session
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        signal: AbortSignal.timeout(6000),
      });
      // SSE streams; a 200 with content-type text/event-stream means it's up
      if (res.ok) {
        res.body?.cancel().catch(() => {});
        return { ok: true, message: "Outline MCP endpoint reachable" };
      }
      return { ok: false, message: `Outline MCP returned ${res.status}` };
    }

    default:
      return { ok: false, message: "Unknown service" };
  }
}
