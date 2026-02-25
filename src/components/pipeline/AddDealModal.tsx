"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, CheckCircle2 } from "lucide-react";
import { STATUS_COLORS } from "@/lib/constants";
import type { AttioSearchResult } from "@/lib/sync/attio";
import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onDealAdded: (deal: DealWithArrays) => void;
}

export function AddDealModal({ open, onClose, onDealAdded }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AttioSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSearchError(null);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({ q: query.trim() });
        const res = await fetch(`/api/attio/search?${params}`);
        if (!res.ok) {
          const data = await res.json();
          setSearchError(data.error ?? "Search failed");
          setResults([]);
        } else {
          const data = await res.json();
          setResults(data.results ?? []);
        }
      } catch {
        setSearchError("Network error");
      } finally {
        setSearching(false);
      }
    }, 350);
  }, [query]);

  async function handleAdd(result: AttioSearchResult) {
    if (result.already_tracked || addingId) return;
    setAddingId(result.attio_entry_id);
    try {
      const res = await fetch("/api/deals/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attio_entry_id: result.attio_entry_id }),
      });
      if (res.ok) {
        const deal: DealWithArrays = await res.json();
        onDealAdded(deal);
        onClose();
      }
    } finally {
      setAddingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Deal from Attio</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Input
              autoFocus
              placeholder="Search by name, paste URL, or paste entry ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pr-8"
            />
            {searching && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
            )}
          </div>

          {searchError && (
            <p className="text-xs text-red-500 px-1">{searchError}</p>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {results.map((r) => (
                <div
                  key={r.attio_entry_id || r.attio_record_id}
                  className={`flex items-center justify-between px-3 py-2.5 ${
                    r.already_tracked
                      ? "bg-gray-50 opacity-60"
                      : "hover:bg-gray-50 cursor-pointer"
                  }`}
                  onClick={() => handleAdd(r)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {r.company_name}
                    </p>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {r.status && (
                        <span
                          className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                            STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {r.status}
                        </span>
                      )}
                      {r.funnel && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                          {r.funnel}
                        </span>
                      )}
                      {r.fund.map((f) => (
                        <span key={f} className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                          {f}
                        </span>
                      ))}
                      {r.source && (
                        <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">
                          {r.source}
                        </span>
                      )}
                      {r.thesis.map((t) => (
                        <span key={t} className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="shrink-0 ml-3">
                    {r.already_tracked ? (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Tracked
                      </div>
                    ) : addingId === r.attio_entry_id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!searching && query.trim().length >= 2 && results.length === 0 && !searchError && (
            <p className="text-sm text-gray-400 text-center py-4">
              No deals found in Attio pipeline matching &ldquo;{query}&rdquo;
            </p>
          )}

          {query.trim().length < 2 && !searching && (
            <p className="text-xs text-gray-400 text-center py-2">
              Type a company name, paste a website URL, or paste an Attio entry ID
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
