// GET /api/settings/env  — read env var keys (masked) from .env.local
// POST /api/settings/env — write one or more env vars to .env.local

import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const ENV_FILE = path.join(process.cwd(), ".env.local");

// Keys we expose through the settings UI
const MANAGED_KEYS = [
  "ATTIO_API_KEY",
  "OUTLINE_API_TOKEN",
  "OUTLINE_MCP_ENDPOINT",
  "ANTHROPIC_API_KEY",
  "HARMONIC_API_KEY",
] as const;

type ManagedKey = (typeof MANAGED_KEYS)[number];

// ─── Parse .env.local ─────────────────────────────────────────────────────────

async function readEnvFile(): Promise<string> {
  try {
    return await readFile(ENV_FILE, "utf-8");
  } catch {
    return "";
  }
}

function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function maskValue(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "•".repeat(value.length);
  return value.slice(0, 4) + "•".repeat(Math.min(value.length - 8, 20)) + value.slice(-4);
}

// ─── Write key to .env.local (preserves other content) ───────────────────────

async function upsertEnvKey(key: string, value: string): Promise<void> {
  let content = await readEnvFile();
  const lines = content.split("\n");
  let found = false;

  const escaped = value.includes('"') ? `'${value}'` : `"${value}"`;
  const newLine = `${key}=${escaped}`;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1 && trimmed.slice(0, eqIdx).trim() === key) {
      lines[i] = newLine;
      found = true;
      break;
    }
  }

  if (!found) {
    if (content && !content.endsWith("\n")) content += "\n";
    content = lines.join("\n") + (found ? "" : `${newLine}\n`);
  } else {
    content = lines.join("\n");
  }

  await writeFile(ENV_FILE, content, "utf-8");
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET() {
  const content = await readEnvFile();
  const parsed = parseEnv(content);

  // Merge process.env (runtime) with .env.local file (may differ if restarted)
  const result: Record<string, { masked: string; set: boolean }> = {};
  for (const key of MANAGED_KEYS) {
    const fileValue = parsed[key] ?? "";
    const runtimeValue = process.env[key] ?? fileValue;
    result[key] = {
      masked: maskValue(runtimeValue),
      set: runtimeValue.length > 0,
    };
  }

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, string>;

  const updated: string[] = [];
  for (const key of MANAGED_KEYS) {
    if (typeof body[key] === "string") {
      await upsertEnvKey(key, body[key]);
      updated.push(key);
    }
  }

  if (updated.length === 0) {
    return NextResponse.json({ error: "No valid keys provided" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    updated,
    note: "Restart the dev server for changes to take effect in running routes.",
  });
}

export type { ManagedKey };
