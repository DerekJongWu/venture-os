"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getLane } from "@/lib/constants";
import type { LaneId } from "@/lib/constants";

interface Props {
  open: boolean;
  targetLaneId: LaneId | null;
  dealName: string;
  onSelect: (status: string) => void;
  onCancel: () => void;
}

export function StatusPickerModal({
  open,
  targetLaneId,
  dealName,
  onSelect,
  onCancel,
}: Props) {
  const lane = targetLaneId ? getLane(targetLaneId) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move {dealName}</DialogTitle>
        </DialogHeader>
        {lane && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">
              Select a status in{" "}
              <span className="font-medium text-gray-700">{lane.label}</span>:
            </p>
            <div className="flex flex-col gap-2">
              {lane.statuses.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  className="justify-start text-sm"
                  onClick={() => onSelect(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
