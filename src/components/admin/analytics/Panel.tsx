"use client";

import React from "react";

interface PanelProps {
  title: string;
  /** Optional right-aligned slot in the header (footnotes, badges). */
  headerRight?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Dark card section with an uppercase kicker title, per the Overview mockup. */
export function Panel({ title, headerRight, className = "", children }: PanelProps) {
  return (
    <section
      className={`bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 min-w-0 ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#666]">
          {title}
        </h3>
        {headerRight}
      </div>
      {children}
    </section>
  );
}
