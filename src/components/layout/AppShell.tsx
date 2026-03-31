"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { DesktopSidebar } from "./DesktopSidebar";

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
      const hasDesktopClass = document.body.classList.contains('greenroom-desktop');
      const hasElectronUA = navigator.userAgent.toLowerCase().includes('electron');
      
      const isElectron = hasGreenroomAPI || hasDesktopClass || hasElectronUA;
      
      if (isElectron) {
        setIsDesktop(true);
        document.body.classList.add('greenroom-desktop');
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
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
        <DesktopSidebar />
        <main className="ml-52 min-h-screen">{children}</main>
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
