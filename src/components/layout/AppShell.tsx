"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { DesktopSidebar } from "./DesktopSidebar";
import { DesktopTitleBar } from "./DesktopTitleBar";
import { DesktopLibrarySync } from "@/components/desktop/DesktopLibrarySync";
import { NowPlayingBar } from "@/components/audio/NowPlayingBar";
import { TermsReacceptanceGate } from "@/components/legal/TermsReacceptanceGate";
import { isDesktopApp } from "@/lib/platform";
import { CreatorWelcomeModal } from "@/components/creator/CreatorWelcomeModal";
import { OutOfCreditsBanner } from "@/components/credits/OutOfCreditsBanner";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Check if running in Electron desktop app (shared detector — also
    // drives the analytics `platform` label, so the two can't drift)
    const checkDesktop = () => {
      const isElectron = isDesktopApp();

      if (isElectron) {
        setIsDesktop(true);
      }

      return isElectron;
    };
    
    // Check immediately
    if (checkDesktop()) return;
    
    // Keep checking for a bit (preload might be slow)
    const checks = [100, 300, 500, 1000];
    const timers = checks.map(ms => setTimeout(() => checkDesktop(), ms));
    
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  useEffect(() => {
    if (!mounted || !isDesktop || typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(new CustomEvent("greenroom:desktop-shell-ready"));
  }, [mounted, isDesktop]);

  // ONE tree for both shells, differing only in which chrome renders and in
  // className — NOT three separate `return`s. The server (and the first client
  // render) sees the web variant, then the effect above flips isDesktop inside
  // the desktop app; because <main> and {children} keep the same position and
  // element type across that flip, React reconciles in place.
  //
  // The three-branch version remounted the ENTIRE page subtree on that flip:
  // the desktop branch nested {children} under a different ancestor chain, so
  // React tore the old tree down and built a new one. Every page under (main)
  // therefore mounted TWICE in the desktop app — fresh state, fresh refs,
  // duplicated mount effects. That silently doubled every mount-fired
  // analytics event for desktop users (paywall_viewed, and the ad pixels'
  // ViewContent before the module-scope guard landed) and re-ran each page's
  // data fetches. Measured: 2 component instances per navigation in an
  // Electron user agent, 1 in a normal browser. Keep the single tree.
  const desktop = mounted && isDesktop;
  return (
    <div
      {...(desktop ? { "data-greenroom-desktop-shell": "true" } : {})}
      className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]"
    >
      {desktop ? (
        <>
          <DesktopSidebar />
          <DesktopTitleBar />
          <DesktopLibrarySync />
        </>
      ) : (
        <Navbar />
      )}
      <main
        className={
          desktop ? "ml-52 pt-10 pb-24 min-h-screen" : "flex-1 pb-24"
        }
      >
        <OutOfCreditsBanner />
        {children}
      </main>
      {!desktop && <Footer />}
      <NowPlayingBar />
      <TermsReacceptanceGate />
      <CreatorWelcomeModal isDesktop={desktop} />
    </div>
  );
}
