"use client";

import React from "react";

export type MarketplaceTab = "samples" | "presets" | "favorites";

const TAB_LABELS: Record<MarketplaceTab, string> = {
  samples: "Samples",
  presets: "Presets",
  favorites: "Favorites",
};

const DEFAULT_TABS: MarketplaceTab[] = ["samples", "presets"];

interface MarketplaceTabsProps {
  activeTab: MarketplaceTab;
  onTabChange: (tab: MarketplaceTab) => void;
  // Callers opt into extra tabs; marketplace and creator dashboard keep the
  // default samples/presets pair.
  tabs?: MarketplaceTab[];
}

export function MarketplaceTabs({
  activeTab,
  onTabChange,
  tabs = DEFAULT_TABS,
}: MarketplaceTabsProps) {
  return (
    <div className="flex gap-1 mb-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-1 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`px-5 py-2 text-sm font-medium rounded-md transition ${
            activeTab === tab
              ? "bg-[#39b54a] text-black"
              : "text-[#a1a1a1] hover:text-white hover:bg-[#2a2a2a]"
          }`}
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  );
}
