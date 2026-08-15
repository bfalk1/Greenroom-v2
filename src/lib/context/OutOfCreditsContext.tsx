"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import {
  OutOfCreditsModal,
  type OutOfCreditsInfo,
} from "@/components/credits/OutOfCreditsModal";

interface OutOfCreditsContextType {
  /** Open the re-up prompt (call when a purchase needs more credits than the user has). */
  openOutOfCredits: (info: OutOfCreditsInfo) => void;
}

// Default is a no-op so a stray consumer outside the provider can't crash.
const OutOfCreditsContext = createContext<OutOfCreditsContextType>({
  openOutOfCredits: () => {},
});

// Mounted once in the (main) layout so every purchase surface (marketplace,
// favorites, following, artist pages) can raise the same re-up prompt.
export function OutOfCreditsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [info, setInfo] = useState<OutOfCreditsInfo | null>(null);

  const openOutOfCredits = useCallback((next: OutOfCreditsInfo) => {
    setInfo(next);
  }, []);

  return (
    <OutOfCreditsContext.Provider value={{ openOutOfCredits }}>
      {children}
      <OutOfCreditsModal info={info} onClose={() => setInfo(null)} />
    </OutOfCreditsContext.Provider>
  );
}

export function useOutOfCredits() {
  return useContext(OutOfCreditsContext);
}
