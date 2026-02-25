"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { STATUS_COLORS } from "@/lib/constants";
import type { DealWithArrays } from "@/lib/deal-utils";

interface Props {
  deal: DealWithArrays;
  onClick: () => void;
  onDelete?: () => void;
}

export function DealCard({ deal, onClick, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="group relative bg-white rounded-lg border border-gray-200 p-3 shadow-sm cursor-pointer hover:border-gray-300 hover:shadow-md transition-all select-none"
    >
      {/* Delete button — shown on hover */}
      {onDelete && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-1.5 right-1.5 hidden group-hover:flex items-center justify-center h-5 w-5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-gray-900 leading-snug">
          {deal.company_name}
        </p>
        {deal.status && (
          <span
            className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
              STATUS_COLORS[deal.status] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {deal.status}
          </span>
        )}
      </div>

      {/* Thesis tags */}
      {deal.thesis.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {deal.thesis.slice(0, 2).map((t) => (
            <Badge key={t} variant="secondary" className="text-xs py-0 px-1.5">
              {t}
            </Badge>
          ))}
          {deal.thesis.length > 2 && (
            <Badge variant="secondary" className="text-xs py-0 px-1.5">
              +{deal.thesis.length - 2}
            </Badge>
          )}
        </div>
      )}

      {/* DD Lead */}
      {deal.dd_lead.length > 0 && (
        <p className="text-xs text-gray-500 mb-1">
          {deal.dd_lead.map((e) => e.split("@")[0]).join(", ")}
        </p>
      )}

      {/* Next steps (1 line) */}
      {deal.next_steps && (
        <p className="text-xs text-gray-400 truncate mb-1.5">{deal.next_steps}</p>
      )}

      {/* Sourced indicator */}
      {deal.sourced && (
        <div className="mt-1">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
            Sourced
          </span>
        </div>
      )}
    </div>
  );
}
