"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DealCard } from "@/components/pipeline/DealCard";
import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  laneId: string;
  label: string;
  deals: DealWithArrays[];
  onSelectDeal: (id: string) => void;
  onDeleteDeal: (id: string) => void;
}

export function KanbanColumn({ laneId, label, deals, onSelectDeal, onDeleteDeal }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: laneId });

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
          {deals.length}
        </span>
      </div>

      {/* drop zone */}
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 flex-1 min-h-[120px] rounded-lg p-2 transition-colors ${
          isOver ? "bg-blue-50 ring-2 ring-blue-200" : "bg-gray-100/60"
        }`}
      >
        <SortableContext
          items={deals.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onClick={() => onSelectDeal(deal.id)}
              onDelete={() => onDeleteDeal(deal.id)}
            />
          ))}
        </SortableContext>

        {deals.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-gray-400">No deals</p>
          </div>
        )}
      </div>
    </div>
  );
}
