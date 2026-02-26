"use client";

import { useState, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { KanbanView } from "@/components/pipeline/KanbanView";
import { TableView } from "@/components/pipeline/TableView";
import { DealDrawer } from "@/components/pipeline/DealDrawer";
import { AddDealModal } from "@/components/pipeline/AddDealModal";
import { SyncStatus } from "@/components/SyncStatus";
import type { DealWithArrays } from "@/lib/deal-utils";
import { LayoutGrid, Table2, Plus, Settings } from "lucide-react";
import Link from "next/link";

interface Props {
  initialDeals: DealWithArrays[];
}

export function PipelineClient({ initialDeals }: Props) {
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [deals, setDeals] = useState<DealWithArrays[]>(initialDeals);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [addDealOpen, setAddDealOpen] = useState(false);

  const selectedDeal = deals.find((d) => d.id === selectedDealId) ?? null;

  const updateDeal = useCallback((updated: DealWithArrays) => {
    setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }, []);

  const patchDeal = useCallback(
    async (id: string, fields: Partial<DealWithArrays>) => {
      // Optimistic update
      setDeals((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, ...fields, updated_at: new Date() } : d
        )
      );

      // Persist to local DB — push() to Attio is called inside the PATCH route
      const res = await fetch(`/api/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (res.ok) {
        const updated: DealWithArrays = await res.json();
        updateDeal({ ...updated, updated_at: new Date(updated.updated_at) });
      }
    },
    [updateDeal]
  );

  const handleDealAdded = useCallback((deal: DealWithArrays) => {
    setDeals((prev) => {
      if (prev.some((d) => d.id === deal.id)) return prev;
      return [deal, ...prev];
    });
    setSelectedDealId(deal.id);
  }, []);

  const handleSyncComplete = useCallback((freshDeals: DealWithArrays[]) => {
    setDeals(freshDeals);
  }, []);

  const deleteDeal = useCallback(async (id: string) => {
    setDeals((prev) => prev.filter((d) => d.id !== id));
    if (selectedDealId === id) setSelectedDealId(null);
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
  }, [selectedDealId]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Navbar */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">Deal Pipeline</h1>
        <div className="flex items-center gap-3">
          <SyncStatus onSyncComplete={handleSyncComplete} />
          <Link
            href="/settings"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <Settings size={15} />
            Settings
          </Link>
        </div>
      </header>

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <Tabs
              value={view}
              onValueChange={(v) => setView(v as "kanban" | "table")}
            >
              <TabsList>
                <TabsTrigger value="kanban" className="flex items-center gap-1.5">
                  <LayoutGrid className="h-4 w-4" />
                  Kanban
                </TabsTrigger>
                <TabsTrigger value="table" className="flex items-center gap-1.5">
                  <Table2 className="h-4 w-4" />
                  Table
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="text-sm text-gray-400">{deals.length} deals</span>
          </div>

          <Button
            size="sm"
            className="flex items-center gap-1.5"
            onClick={() => setAddDealOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add Deal
          </Button>
        </div>

        {/* View */}
        <div className="flex-1 overflow-auto">
          {view === "kanban" ? (
            <KanbanView
              deals={deals}
              onSelectDeal={setSelectedDealId}
              onPatchDeal={patchDeal}
              onDeleteDeal={deleteDeal}
            />
          ) : (
            <TableView deals={deals} onSelectDeal={setSelectedDealId} />
          )}
        </div>
      </div>

      {/* Deal detail drawer */}
      <DealDrawer
        deal={selectedDeal}
        onClose={() => setSelectedDealId(null)}
        onPatchDeal={patchDeal}
        onSyncDeal={updateDeal}
      />

      {/* Add deal modal */}
      <AddDealModal
        open={addDealOpen}
        onClose={() => setAddDealOpen(false)}
        onDealAdded={handleDealAdded}
      />
    </div>
  );
}
