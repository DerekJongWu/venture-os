"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/pipeline/KanbanColumn";
import { DealCard } from "@/components/pipeline/DealCard";
import { StatusPickerModal } from "@/components/pipeline/StatusPickerModal";
import { SWIM_LANES, getLaneForStatus } from "@/lib/constants";
import type { LaneId } from "@/lib/constants";
import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  deals: DealWithArrays[];
  onSelectDeal: (id: string) => void;
  onPatchDeal: (id: string, fields: Partial<DealWithArrays>) => Promise<void>;
  onDeleteDeal: (id: string) => void;
}

export function KanbanView({ deals, onSelectDeal, onPatchDeal, onDeleteDeal }: Props) {
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [pendingDrag, setPendingDrag] = useState<{
    dealId: string;
    targetLaneId: LaneId;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const activeDeal = deals.find((d) => d.id === activeDealId) ?? null;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDealId(null);

    if (!over) return;

    const dealId = active.id as string;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;

    const currentLaneId = getLaneForStatus(deal.status);

    // over.id can be either a lane id or another card id
    // Determine which lane was dropped into
    let targetLaneId: LaneId | undefined;

    // Check if dropped directly on a lane droppable
    const laneMatch = SWIM_LANES.find((l) => l.id === over.id);
    if (laneMatch) {
      targetLaneId = laneMatch.id;
    } else {
      // over.id is another card — find which lane that card is in
      const overDeal = deals.find((d) => d.id === over.id);
      if (overDeal) targetLaneId = getLaneForStatus(overDeal.status);
    }

    if (!targetLaneId || targetLaneId === currentLaneId) return;

    // Cross-lane drag → open status picker
    setPendingDrag({ dealId, targetLaneId });
  }

  async function handleStatusSelect(status: string) {
    if (!pendingDrag) return;
    await onPatchDeal(pendingDrag.dealId, { status });
    setPendingDrag(null);
  }

  const dealsByLane = SWIM_LANES.reduce<Record<string, DealWithArrays[]>>(
    (acc, lane) => {
      acc[lane.id] = deals.filter(
        (d) => getLaneForStatus(d.status) === lane.id
      );
      return acc;
    },
    {}
  );

  const pendingDealName =
    deals.find((d) => d.id === pendingDrag?.dealId)?.company_name ?? "";

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveDealId(e.active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 p-6 overflow-x-auto h-full items-start">
          {SWIM_LANES.map((lane) => (
            <KanbanColumn
              key={lane.id}
              laneId={lane.id}
              label={lane.label}
              deals={dealsByLane[lane.id] ?? []}
              onSelectDeal={onSelectDeal}
              onDeleteDeal={onDeleteDeal}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDeal && (
            <DealCard deal={activeDeal} onClick={() => {}} />
          )}
        </DragOverlay>
      </DndContext>

      <StatusPickerModal
        open={!!pendingDrag}
        targetLaneId={pendingDrag?.targetLaneId ?? null}
        dealName={pendingDealName}
        onSelect={handleStatusSelect}
        onCancel={() => setPendingDrag(null)}
      />
    </>
  );
}
