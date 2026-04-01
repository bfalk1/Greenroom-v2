"use client";

import React from "react";
import { CheckSquare, Square } from "lucide-react";

export type SampleTableVariant = "browse" | "library" | "creator";

const GRID_CLASS_BY_VARIANT: Record<SampleTableVariant, string> = {
  browse:
    "grid grid-cols-[auto_auto_1fr_80px_60px] md:grid-cols-[auto_auto_minmax(220px,1fr)_220px_90px_45px_45px_80px_50px]",
  library:
    "grid grid-cols-[auto_auto_auto_1fr_80px_60px] md:grid-cols-[auto_auto_auto_minmax(220px,1fr)_220px_90px_45px_45px_80px_50px]",
  creator:
    "grid grid-cols-[auto_1fr_70px_80px] md:grid-cols-[auto_minmax(220px,1fr)_220px_80px_45px_45px_70px_80px_100px]",
};

export const SAMPLE_TABLE_WAVEFORM_CLASS =
  "hidden md:block w-[220px]";

export function getSampleTableRowClass(
  variant: SampleTableVariant,
  state?: {
    isActive?: boolean;
    isDragging?: boolean;
  }
) {
  return [
    GRID_CLASS_BY_VARIANT[variant],
    "gap-2 md:gap-3 px-3 md:px-4 py-3 items-center transition-colors select-none",
    state?.isActive ? "bg-[#39b54a]/5" : "hover:bg-[#242424]",
    state?.isDragging ? "opacity-50" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

type SortDirection = "asc" | "desc";

interface SampleTableHeaderProps {
  variant?: SampleTableVariant;
  sortable?: boolean;
  onSort?: (column: string) => void;
  sortBy?: string;
  sortDir?: SortDirection;
  onToggleAll?: () => void;
  allSelected?: boolean;
}

export function SampleTableHeader({
  variant = "browse",
  sortable = false,
  onSort,
  sortBy,
  sortDir,
  onToggleAll,
  allSelected = false,
}: SampleTableHeaderProps) {
  const renderSortHeader = (column: string, label: string) => {
    if (!sortable || !onSort) {
      return <div className="text-xs font-medium text-[#a1a1a1]">{label}</div>;
    }

    const isActive = sortBy === column;
    return (
      <button
        onClick={() => onSort(column)}
        className={`text-xs font-medium flex items-center gap-1 transition ${
          isActive ? "text-[#39b54a]" : "text-[#a1a1a1] hover:text-white"
        }`}
      >
        {label}
        {isActive && (
          sortDir === "asc" ? (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )
        )}
      </button>
    );
  };

  if (variant === "library") {
    return (
      <div className={`${GRID_CLASS_BY_VARIANT.library} gap-2 md:gap-3 px-3 md:px-4 py-3 border-b border-[#2a2a2a] bg-[#141414]`}>
        <button onClick={onToggleAll} className="flex-shrink-0">
          {allSelected ? (
            <CheckSquare className="w-4 h-4 text-[#39b54a]" />
          ) : (
            <Square className="w-4 h-4 text-[#3a3a3a] hover:text-white" />
          )}
        </button>
        <div className="w-6" />
        <div className="w-10" />
        <span className="text-xs font-medium text-[#a1a1a1]">Name</span>
        <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Wave</span>
        <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Genre</span>
        <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Key</span>
        <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">BPM</span>
        <span className="hidden md:block text-xs font-medium text-[#a1a1a1] text-center">★</span>
        <span className="text-xs font-medium text-[#a1a1a1]"></span>
      </div>
    );
  }

  if (variant === "creator") {
    return (
      <div className={`${GRID_CLASS_BY_VARIANT.creator} gap-2 md:gap-3 px-3 md:px-4 py-3 border-b border-[#2a2a2a] bg-[#141414]`}>
        <div className="w-10" />
        <span className="text-xs font-medium text-[#a1a1a1]">Name</span>
        <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Wave</span>
        <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Genre</span>
        <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Key</span>
        <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">BPM</span>
        <span className="hidden md:block text-xs font-medium text-[#a1a1a1]">Rating</span>
        <span className="text-xs font-medium text-[#a1a1a1]">Status</span>
        <span className="text-xs font-medium text-[#a1a1a1] text-right">Actions</span>
      </div>
    );
  }

  return (
    <div className={`${GRID_CLASS_BY_VARIANT.browse} gap-2 md:gap-3 px-3 md:px-4 py-3 border-b border-[#2a2a2a] bg-[#141414]`}>
      <div className="w-6" />
      <div className="w-10" />
      {renderSortHeader("name", "Name")}
      <div className="hidden md:block text-xs font-medium text-[#a1a1a1]">Wave</div>
      <div className="hidden md:block">{renderSortHeader("genre", "Genre")}</div>
      <div className="hidden md:block">{renderSortHeader("key", "Key")}</div>
      <div className="hidden md:block">{renderSortHeader("bpm", "BPM")}</div>
      <div className="hidden md:block">{renderSortHeader("rating", "★")}</div>
      <div className="text-xs font-medium text-[#a1a1a1]"></div>
    </div>
  );
}
