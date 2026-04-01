"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { DesktopSidebar } from "./DesktopSidebar";
import { DesktopTitleBar } from "./DesktopTitleBar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Check if running in Electron desktop app
    const checkDesktop = () => {
      const hasGreenroomAPI = !!(window as any).greenroom?.isDesktop;
      const hasElectronUA = navigator.userAgent.toLowerCase().includes('electron');
      
      const isElectron = hasGreenroomAPI || hasElectronUA;
      
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

  // Prevent hydration mismatch - render web layout on server
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    );
  }

  // Desktop app layout with sidebar
  if (isDesktop) {
    return (
      <div
        data-greenroom-desktop-shell="true"
        className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]"
      >
        <DesktopSidebar />
        <DesktopTitleBar />
        <main className="ml-52 pt-10 min-h-screen">{children}</main>
      </div>
    );
  }

  // Web layout with navbar + footer
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
