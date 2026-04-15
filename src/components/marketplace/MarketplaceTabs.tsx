"use client";

import React from "react";

export type MarketplaceTab = "samples" | "presets";

interface MarketplaceTabsProps {
  activeTab: MarketplaceTab;
  onTabChange: (tab: MarketplaceTab) => void;
}

export function MarketplaceTabs({ activeTab, onTabChange }: MarketplaceTabsProps) {
  return (
    <div className="flex gap-1 mb-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-1 w-fit">
      <button
        onClick={() => onTabChange("samples")}
        className={`px-5 py-2 text-sm font-medium rounded-md transition ${
          activeTab === "samples"
            ? "bg-[#39b54a] text-black"
            : "text-[#a1a1a1] hover:text-white hover:bg-[#2a2a2a]"
        }`}
      >
        Samples
      </button>
      <button
        onClick={() => onTabChange("presets")}
        className={`px-5 py-2 text-sm font-medium rounded-md transition ${
          activeTab === "presets"
            ? "bg-[#39b54a] text-black"
            : "text-[#a1a1a1] hover:text-white hover:bg-[#2a2a2a]"
        }`}
      >
        Presets
      </button>
    </div>
  );
}
