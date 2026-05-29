"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

export interface AdminSidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  group?: string;
}

interface AdminSidebarProps {
  items: AdminSidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function AdminSidebar({ items, activeId, onSelect }: AdminSidebarProps) {
  // Group items in order they appear, preserving "ungrouped" first-class items
  // before any titled group.
  let lastGroup: string | undefined = undefined;

  return (
    <nav
      aria-label="Admin sections"
      className="w-full md:w-56 md:shrink-0"
    >
      <ul className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-2 md:sticky md:top-4">
        {items.map((item) => {
          const showGroupHeader = item.group && item.group !== lastGroup;
          if (item.group) lastGroup = item.group;
          const Icon = item.icon;
          const isActive = activeId === item.id;
          return (
            <React.Fragment key={item.id}>
              {showGroupHeader && (
                <li className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#666]">
                  {item.group}
                </li>
              )}
              <li>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex w-full items-center gap-2 px-3 py-2 rounded-md text-sm transition ${
                    isActive
                      ? "bg-[#39b54a]/10 text-[#39b54a]"
                      : "text-[#a1a1a1] hover:bg-[#242424] hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {item.badge ? (
                    <span
                      className={`ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-medium ${
                        isActive
                          ? "bg-[#39b54a] text-black"
                          : "bg-[#2a2a2a] text-[#a1a1a1]"
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              </li>
            </React.Fragment>
          );
        })}
      </ul>
    </nav>
  );
}
