"use client";

import React from "react";

export function DesktopTitleBar() {
  return (
    <div
      className="h-10 bg-[#0a0a0a] border-b border-[#1a1a1a] flex items-center justify-center fixed top-0 left-52 right-0 z-40"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Empty draggable area - traffic lights are on the sidebar */}
    </div>
  );
}
