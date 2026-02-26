"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { OverviewTab } from "@/components/deal/OverviewTab";
import { NotesTab } from "@/components/deal/NotesTab";
import { TranscriptsTab } from "@/components/deal/TranscriptsTab";
import { DataRoomTab } from "@/components/deal/DataRoomTab";
import { HarmonicTab } from "@/components/deal/HarmonicTab";
import { ScreeningTab } from "@/components/deal/ScreeningTab";
import { DDMemoTab } from "@/components/deal/DDMemoTab";
import type { DealWithArrays } from "@/lib/deal-utils";
import { STATUS_COLORS } from "@/lib/constants";

interface Props {
  deal: DealWithArrays | null;
  onClose: () => void;
  onPatchDeal: (id: string, fields: Partial<DealWithArrays>) => Promise<void>;
  onSyncDeal: (updated: DealWithArrays) => void;
}

export function DealDrawer({ deal, onClose, onPatchDeal, onSyncDeal }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [enrichedPreview, setEnrichedPreview] = useState<string | null>(null);

  function handleEnrichComplete(content: string) {
    setEnrichedPreview(content);
    setActiveTab("notes");
  }

  async function handleSync() {
    if (!deal || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, { method: "POST" });
      if (res.ok) {
        const updated: DealWithArrays = await res.json();
        onSyncDeal(updated);
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handlePushToAttio() {
    if (!deal || pushing) return;
    setPushing(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}/push`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "Pushed to Attio", description: "Local changes synced to Attio." });
      } else {
        toast({
          title: "Push failed",
          description: (data.error as string) || `HTTP ${res.status}`,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Push failed",
        description: "Network or server error.",
        variant: "destructive",
      });
    } finally {
      setPushing(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setMaximized(false);
      setActiveTab("overview");
      setEnrichedPreview(null);
      onClose();
    }
  }

  return (
    <Sheet open={!!deal} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className={`overflow-y-auto flex flex-col p-0 transition-all duration-200 ${
          maximized ? "w-full sm:max-w-full" : "w-full sm:max-w-2xl"
        }`}
      >
        {/* Maximize/minimize button — sits just left of the built-in close button */}
        <button
          onClick={() => setMaximized((m) => !m)}
          className="absolute right-10 top-4 z-10 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          title={maximized ? "Exit fullscreen" : "Fullscreen"}
        >
          {maximized
            ? <Minimize2 className="h-4 w-4" />
            : <Maximize2 className="h-4 w-4" />}
          <span className="sr-only">{maximized ? "Exit fullscreen" : "Fullscreen"}</span>
        </button>

        {deal && (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-200 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-lg font-semibold text-gray-900 truncate">
                    {deal.company_name}
                  </SheetTitle>
                  <div className="flex items-center gap-2 mt-1">
                    {deal.status && (
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          STATUS_COLORS[deal.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {deal.status}
                      </span>
                    )}
                    {deal.lighthouse_url && (
                      <a
                        href={deal.lighthouse_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Lighthouse
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </SheetHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1">
              <TabsList className="w-full justify-start rounded-none border-b border-gray-200 bg-white px-2 shrink-0 h-10 overflow-x-auto">
                <TabsTrigger value="overview" className="text-sm">Overview</TabsTrigger>
                <TabsTrigger value="notes" className="text-sm">Notes</TabsTrigger>
                <TabsTrigger value="transcripts" className="text-sm">Transcripts</TabsTrigger>
                <TabsTrigger value="screening" className="text-sm">Screening</TabsTrigger>
                <TabsTrigger value="ddmemo" className="text-sm">DD Memo</TabsTrigger>
                <TabsTrigger value="dataroom" className="text-sm">Data Room</TabsTrigger>
                <TabsTrigger value="harmonic" className="text-sm">Harmonic</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto">
                <TabsContent value="overview" className="m-0 p-6">
                  <OverviewTab
                    deal={deal}
                    onPatchDeal={onPatchDeal}
                    onPushToAttio={handlePushToAttio}
                    onSyncFromAttio={handleSync}
                    pushing={pushing}
                    syncing={syncing}
                  />
                </TabsContent>
                <TabsContent value="notes" className="m-0 p-6">
                  <NotesTab
                    deal={deal}
                    enrichedPreview={enrichedPreview}
                    onEnrichConsumed={() => setEnrichedPreview(null)}
                  />
                </TabsContent>
                <TabsContent value="transcripts" className="m-0 p-6">
                  <TranscriptsTab
                    deal={deal}
                    onPatchDeal={onPatchDeal}
                    onEnrichComplete={handleEnrichComplete}
                  />
                </TabsContent>
                <TabsContent value="screening" className="m-0 p-6">
                  <ScreeningTab deal={deal} onScreeningComplete={handleEnrichComplete} />
                </TabsContent>
                <TabsContent value="ddmemo" className="m-0 p-6">
                  <DDMemoTab deal={deal} />
                </TabsContent>
                <TabsContent value="dataroom" className="m-0 p-6">
                  <DataRoomTab deal={deal} />
                </TabsContent>
                <TabsContent value="harmonic" className="m-0 p-6">
                  <HarmonicTab deal={deal} />
                </TabsContent>
              </div>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
