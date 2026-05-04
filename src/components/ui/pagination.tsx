"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  className?: string;
}

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [1];

  if (current > 4) {
    pages.push("ellipsis");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 3) {
    pages.push("ellipsis");
  }

  pages.push(total);
  return pages;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  disabled = false,
  className = "",
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);
  const goTo = (page: number) => {
    if (disabled || page === currentPage || page < 1 || page > totalPages) return;
    onPageChange(page);
  };

  const buttonBase =
    "h-9 min-w-[36px] px-3 flex items-center justify-center rounded-md text-sm font-medium border transition disabled:opacity-40 disabled:cursor-not-allowed";
  const inactiveButton =
    "bg-[#1a1a1a] border-[#2a2a2a] text-[#a1a1a1] hover:text-white hover:border-[#39b54a]/50";
  const activeButton =
    "bg-[#39b54a] border-[#39b54a] text-black";

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-wrap items-center justify-center gap-2 ${className}`}
    >
      <button
        type="button"
        onClick={() => goTo(currentPage - 1)}
        disabled={disabled || currentPage <= 1}
        aria-label="Previous page"
        className={`${buttonBase} ${inactiveButton}`}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {pages.map((page, i) =>
        page === "ellipsis" ? (
          <span
            key={`ellipsis-${i}`}
            className="h-9 min-w-[36px] flex items-center justify-center text-sm text-[#3a3a3a]"
          >
            …
          </span>
        ) : (
          <button
            key={page}
            type="button"
            onClick={() => goTo(page)}
            disabled={disabled}
            aria-current={page === currentPage ? "page" : undefined}
            className={`${buttonBase} ${page === currentPage ? activeButton : inactiveButton}`}
          >
            {page}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => goTo(currentPage + 1)}
        disabled={disabled || currentPage >= totalPages}
        aria-label="Next page"
        className={`${buttonBase} ${inactiveButton}`}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}
