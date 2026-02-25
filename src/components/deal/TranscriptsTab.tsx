"use client";

import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  deal: DealWithArrays;
}

export function TranscriptsTab(_props: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm text-gray-500">Transcripts — coming in Phase 5</p>
    </div>
  );
}
