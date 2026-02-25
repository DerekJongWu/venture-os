"use client";

import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  deal: DealWithArrays;
}

export function DataRoomTab(_props: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm text-gray-500">Data Room — coming in Phase 6</p>
    </div>
  );
}
