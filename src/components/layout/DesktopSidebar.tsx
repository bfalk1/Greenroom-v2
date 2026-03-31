"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Library,
  Heart,
  Users,
  Settings,
  LogOut,
  Search,
} from "lucide-react";
import { useUser } from "@/lib/hooks/useUser";

export function DesktopSidebar() {
  const pathname = usePathname();
  const { user, logout } = useUser();

  const isActive = (href: string) => pathname === href;

  const NavItem = ({
    href,
    icon: Icon,
    label,
  }: {
    href: string;
    icon: React.ElementType;
    label: string;
  }) => (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        isActive(href)
          ? "bg-[#39b54a]/15 text-[#39b54a]"
          : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
      }`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span>{label}</span>
    </Link>
  );

  return (
    <aside className="w-52 bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col h-screen fixed left-0 top-0 z-50">
      {/* Drag region for window - extra padding for macOS traffic lights */}
      <div 
        className="h-16 flex items-end pb-3 px-4 border-b border-[#1a1a1a]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697bed99d794c79d63ec6b73/c33d47e0e_GREENROOMLOGOWHITE.png"
          alt="GREENROOM"
          className="h-4"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        <NavItem href="/marketplace" icon={Home} label="Home" />
        <NavItem href="/sounds" icon={Search} label="Browse" />
        <NavItem href="/library" icon={Library} label="Library" />
        <NavItem href="/favorites" icon={Heart} label="Favorites" />
        <NavItem href="/following" icon={Users} label="Following" />
      </nav>

      {/* Bottom section */}
      <div className="border-t border-[#1a1a1a] p-2 space-y-1">
        {user && (
          <>
            {/* Credits */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a1a1a] mb-2">
              <img src="/g-icon.png" alt="" className="w-4 h-4" />
              <span className="text-sm font-medium text-white">{user.credits}</span>
              <span className="text-xs text-[#666]">credits</span>
            </div>
            
            <NavItem href="/account" icon={Settings} label="Settings" />
            
            <button
              onClick={logout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#888] hover:text-white hover:bg-[#1a1a1a] transition-all w-full"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
