"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DealWithArrays } from "@/lib/deal-utils";
import type { SyncStatusResponse } from "@/app/api/sync/status/route";

interface Props {
  onSyncComplete?: (deals: DealWithArrays[]) => void;
}

export function SyncStatus({ onSyncComplete }: Props) {
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/status");
      if (res.ok) setSyncStatus(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await fetch("/api/sync/pull", { method: "POST" });
      // Re-fetch deals so PipelineClient reflects the pulled changes
      if (onSyncComplete) {
        const dealsRes = await fetch("/api/deals");
        if (dealsRes.ok) {
          const deals: DealWithArrays[] = await dealsRes.json();
          onSyncComplete(deals);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setSyncing(false);
      fetchStatus();
    }
  };

  // Dot colour
  const dotClass = syncing
    ? "bg-yellow-400 animate-pulse"
    : syncStatus?.status === "error"
    ? "bg-red-500"
    : syncStatus?.status === "success"
    ? "bg-green-500"
    : "bg-gray-300";

  // Tooltip text
  let tooltipLines: string[] = [];
  if (syncing) {
    tooltipLines = ["Syncing with Attio…"];
  } else if (syncStatus?.status === "success") {
    tooltipLines = [
      "Synced successfully",
      syncStatus.last_synced_at
        ? `Last sync: ${new Date(syncStatus.last_synced_at).toLocaleString()}`
        : "",
    ].filter(Boolean);
  } else if (syncStatus?.status === "error") {
    tooltipLines = [
      "Last sync had errors",
      ...(syncStatus.error ? [syncStatus.error] : []),
    ];
  } else {
    tooltipLines = ["No sync run yet"];
  }

  return (
    <div className="flex items-center gap-2">
      {/* Status dot with hover tooltip */}
      <div className="relative group">
        <div
          className={`h-2.5 w-2.5 rounded-full transition-colors ${dotClass}`}
        />
        <div
          className="
            invisible group-hover:visible
            absolute bottom-full mb-2 right-0
            bg-gray-900 text-white text-xs rounded-md
            px-2.5 py-1.5 w-56 z-50
            leading-relaxed whitespace-pre-wrap
          "
        >
          {tooltipLines.join("\n")}
          {/* Tooltip arrow */}
          <div className="absolute top-full right-2 border-4 border-transparent border-t-gray-900" />
        </div>
      </div>

      <Button
        size="sm"
        variant="ghost"
        onClick={handleSyncNow}
        disabled={syncing}
        className="h-7 px-2 text-xs text-gray-500 hover:text-gray-900"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`}
        />
        {syncing ? "Syncing…" : "Sync Now"}
      </Button>
    </div>
  );
}
