"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiKeyName =
  | "ATTIO_API_KEY"
  | "OUTLINE_API_TOKEN"
  | "OUTLINE_MCP_ENDPOINT"
  | "ANTHROPIC_API_KEY"
  | "HARMONIC_API_KEY";

type TestService = "attio" | "outline" | "anthropic" | "harmonic";

interface EnvRow {
  masked: string;
  set: boolean;
}

interface SyncLog {
  id: string;
  entity_type: string;
  entity_id: string;
  direction: string;
  source: string;
  status: string;
  error: string | null;
  synced_at: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchEnv(): Promise<Record<ApiKeyName, EnvRow>> {
  const res = await fetch("/api/settings/env");
  if (!res.ok) return {} as Record<ApiKeyName, EnvRow>;
  return res.json().catch(() => ({} as Record<ApiKeyName, EnvRow>));
}

async function saveEnvKey(key: ApiKeyName, value: string) {
  return fetch("/api/settings/env", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [key]: value }),
  });
}

async function testConnection(service: TestService): Promise<{ ok: boolean; message: string }> {
  const res = await fetch("/api/settings/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service }),
  });
  return res.json().catch(() => ({ ok: false, message: `HTTP ${res.status}` }));
}

async function fetchPrompts(): Promise<Record<string, string>> {
  const res = await fetch("/api/settings/prompts");
  if (!res.ok) return {};
  return res.json().catch(() => ({}));
}

async function savePrompt(key: string, value: string) {
  return fetch("/api/settings/prompts", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [key]: value }),
  });
}

async function fetchLogs(): Promise<SyncLog[]> {
  const res = await fetch("/api/sync/logs");
  return res.json();
}

async function clearLogs() {
  return fetch("/api/sync/logs", { method: "DELETE" });
}

async function pullFromAttio(): Promise<{ synced: number; errors: string[] }> {
  const res = await fetch("/api/sync/pull", { method: "POST" });
  return res.json();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const API_KEY_LABELS: Record<ApiKeyName, { label: string; service: TestService | null; placeholder: string }> = {
  ATTIO_API_KEY:       { label: "Attio API Key",           service: "attio",     placeholder: "sk_live_…" },
  OUTLINE_API_TOKEN:   { label: "Outline API Token",       service: "outline",   placeholder: "Bearer token…" },
  OUTLINE_MCP_ENDPOINT:{ label: "Outline MCP Endpoint",   service: "outline",   placeholder: "https://mcp.lighthouse.ai/sse" },
  ANTHROPIC_API_KEY:   { label: "Anthropic API Key",       service: "anthropic", placeholder: "sk-ant-…" },
  HARMONIC_API_KEY:    { label: "Harmonic API Key",        service: "harmonic",  placeholder: "API key…" },
};

function ApiKeyRow({
  name,
  row,
  onSaved,
}: {
  name: ApiKeyName;
  row: EnvRow;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const meta = API_KEY_LABELS[name];

  async function handleSave() {
    setSaving(true);
    try {
      await saveEnvKey(name, value);
      setEditing(false);
      setValue("");
      setTestResult(null);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!meta.service) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection(meta.service);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-800">{meta.label}</p>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{name}</p>
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.set ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {row.set ? "Set" : "Not set"}
            </span>
          )}
          {!editing && row.set && !revealed && (
            <span className="text-xs font-mono text-gray-400">{row.masked}</span>
          )}
          {!editing && meta.service && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleTest}
              disabled={testing}
              className="text-xs h-7"
            >
              {testing ? <Loader2 size={11} className="animate-spin" /> : "Test"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditing(true); setValue(""); }}
            className="text-xs h-7"
          >
            {row.set ? "Update" : "Set"}
          </Button>
        </div>
      </div>

      {editing && (
        <div className="flex items-center gap-2">
          <input
            type={revealed ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={meta.placeholder}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="p-1.5 text-gray-400 hover:text-gray-600"
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <Button size="sm" onClick={handleSave} disabled={saving || !value.trim()} className="h-7">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditing(false); setValue(""); }}
            className="h-7"
          >
            <X size={13} />
          </Button>
        </div>
      )}

      {testResult && (
        <p className={`text-xs flex items-center gap-1 ${testResult.ok ? "text-green-600" : "text-red-500"}`}>
          {testResult.ok ? <Check size={11} /> : <X size={11} />}
          {testResult.message}
        </p>
      )}
    </div>
  );
}

function PromptEditor({
  label,
  settingKey,
  placeholder,
  hint,
}: {
  label: string;
  settingKey: string;
  placeholder: string;
  hint?: string;
}) {
  const [value, setValue] = useState("");
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPrompts().then((p) => {
      const v = p[settingKey] ?? "";
      setValue(v);
      setOriginal(v);
    });
  }, [settingKey]);

  const dirty = value !== original;

  async function handleSave() {
    setSaving(true);
    try {
      await savePrompt(settingKey, value);
      setOriginal(value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-800">{label}</p>
          {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="gap-1.5"
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : saved ? (
            <><Check size={12} />Saved</>
          ) : (
            "Save"
          )}
        </Button>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={12}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}

function SyncLogTable({ logs }: { logs: SyncLog[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Entity</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Direction</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Source</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600 max-w-[200px]">Error</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                {new Date(log.synced_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="px-3 py-2 font-mono text-gray-600 max-w-[120px] truncate">
                {log.entity_type === "deal" ? log.entity_id.slice(-8) : log.entity_id}
              </td>
              <td className="px-3 py-2 text-gray-600">{log.direction}</td>
              <td className="px-3 py-2 text-gray-600">{log.source}</td>
              <td className="px-3 py-2">
                <span
                  className={`px-1.5 py-0.5 rounded-full font-medium ${
                    log.status === "success"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-600"
                  }`}
                >
                  {log.status}
                </span>
              </td>
              <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate" title={log.error ?? ""}>
                {log.error ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-1">
      <h2 className="text-base font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [envData, setEnvData] = useState<Record<ApiKeyName, EnvRow> | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<{ synced: number; errors: string[] } | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [fundName, setFundName] = useState("");
  const [fundNameOriginal, setFundNameOriginal] = useState("");
  const [savingFundName, setSavingFundName] = useState(false);
  const [fundNameSaved, setFundNameSaved] = useState(false);

  const loadEnv = useCallback(async () => {
    const data = await fetchEnv();
    setEnvData(data as Record<ApiKeyName, EnvRow>);
  }, []);

  const loadLogs = useCallback(async () => {
    const data = await fetchLogs();
    setLogs(data);
    setLogsLoaded(true);
  }, []);

  useEffect(() => {
    loadEnv();
    fetchPrompts().then((p) => {
      const fn = p["fund_name"] ?? "";
      setFundName(fn);
      setFundNameOriginal(fn);
    });
  }, [loadEnv]);

  async function handlePull() {
    setPulling(true);
    setPullResult(null);
    try {
      const result = await pullFromAttio();
      setPullResult(result);
      if (logsLoaded) loadLogs();
    } finally {
      setPulling(false);
    }
  }

  async function handleToggleLogs() {
    if (!showLogs && !logsLoaded) await loadLogs();
    setShowLogs((s) => !s);
  }

  async function handleClearLogs() {
    setClearingLogs(true);
    try {
      await clearLogs();
      setLogs([]);
    } finally {
      setClearingLogs(false);
    }
  }

  async function handleSaveFundName() {
    setSavingFundName(true);
    try {
      await savePrompt("fund_name", fundName);
      setFundNameOriginal(fundName);
      setFundNameSaved(true);
      setTimeout(() => setFundNameSaved(false), 2000);
    } finally {
      setSavingFundName(false);
    }
  }

  const API_KEY_ORDER: ApiKeyName[] = [
    "ATTIO_API_KEY",
    "ANTHROPIC_API_KEY",
    "HARMONIC_API_KEY",
    "OUTLINE_API_TOKEN",
    "OUTLINE_MCP_ENDPOINT",
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4"
          >
            <ArrowLeft size={14} />
            Back to Pipeline
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage API keys, AI prompts, and sync preferences.
          </p>
        </div>

        {/* ── 1. API Keys ── */}
        <Section title="API Keys">
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
            Changes are saved to <code className="font-mono">.env.local</code>. Restart the dev server for updated keys to take effect in running routes.
          </p>
          <div>
            {envData
              ? API_KEY_ORDER.map((key) => (
                  <ApiKeyRow
                    key={key}
                    name={key}
                    row={envData[key]}
                    onSaved={loadEnv}
                  />
                ))
              : <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>}
          </div>
        </Section>

        {/* ── 2. General ── */}
        <Section title="General">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Fund Name</p>
              <p className="text-xs text-gray-400 mt-0.5">Used as the header in exported PDF memos.</p>
            </div>
            <Button
              size="sm"
              onClick={handleSaveFundName}
              disabled={savingFundName || fundName === fundNameOriginal}
              className="gap-1.5 shrink-0"
            >
              {savingFundName ? (
                <Loader2 size={12} className="animate-spin" />
              ) : fundNameSaved ? (
                <><Check size={12} />Saved</>
              ) : (
                "Save"
              )}
            </Button>
          </div>
          <input
            type="text"
            value={fundName}
            onChange={(e) => setFundName(e.target.value)}
            placeholder="e.g. Acme Ventures"
            className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Section>

        {/* ── 3. Prompts ── */}
        <Section title="AI Prompts">
          <div className="space-y-8">
            <PromptEditor
              label="Screening Prompt"
              settingKey="screening_prompt"
              placeholder="Paste your screening prompt here…"
              hint="Used when running company screenings from the Screening tab."
            />
            <PromptEditor
              label="DD Memo Prompt"
              settingKey="dd_memo_prompt"
              placeholder="Paste your DD memo prompt here. Context (deal fields, Lighthouse doc, transcripts, data room) is appended automatically."
              hint="Used when generating DD memos from the DD Memo tab."
            />
          </div>
        </Section>

        {/* ── 4. Sync ── */}
        <Section title="Sync Controls">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={handlePull}
                disabled={pulling}
                className="gap-1.5"
              >
                {pulling ? (
                  <><Loader2 size={12} className="animate-spin" />Pulling…</>
                ) : (
                  <><RefreshCw size={13} />Pull from Attio Now</>
                )}
              </Button>

              {pullResult && (
                <p className={`text-sm ${pullResult.errors.length > 0 ? "text-amber-600" : "text-green-600"}`}>
                  {pullResult.errors.length > 0
                    ? `Synced ${pullResult.synced} deal(s) with ${pullResult.errors.length} error(s)`
                    : `Synced ${pullResult.synced} deal(s) successfully`}
                </p>
              )}
            </div>

            {pullResult?.errors && pullResult.errors.length > 0 && (
              <ul className="text-xs text-red-600 space-y-0.5 pl-4 list-disc">
                {pullResult.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {pullResult.errors.length > 5 && (
                  <li>…and {pullResult.errors.length - 5} more</li>
                )}
              </ul>
            )}

            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              <Button
                size="sm"
                variant="outline"
                onClick={handleToggleLogs}
                className="gap-1.5"
              >
                {showLogs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {showLogs ? "Hide" : "View"} Sync Log
              </Button>

              {showLogs && logs.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearLogs}
                  disabled={clearingLogs}
                  className="gap-1.5 text-red-500 hover:text-red-600"
                >
                  {clearingLogs
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Trash2 size={12} />}
                  Clear Logs
                </Button>
              )}
            </div>

            {showLogs && (
              logs.length === 0
                ? <p className="text-sm text-gray-400">No sync logs yet.</p>
                : <SyncLogTable logs={logs} />
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
