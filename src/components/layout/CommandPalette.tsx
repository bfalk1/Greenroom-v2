"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Home,
  Library,
  Heart,
  Users,
  Upload,
  Settings,
  LogOut,
  Music,
  User,
  LayoutDashboard,
  DollarSign,
  Command,
} from "lucide-react";
import { useUser } from "@/lib/hooks/useUser";

interface CommandItem {
  id: string;
  label: string;
  icon: React.ElementType;
  action: () => void;
  keywords?: string[];
  section: string;
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { user, logout } = useUser();

  const hasActiveSub =
    user?.subscription_status === "active" ||
    user?.subscription_status === "past_due" ||
    user?.role === "CREATOR" ||
    user?.role === "ADMIN" ||
    user?.role === "MODERATOR";

  const commands: CommandItem[] = [
    // Navigation
    {
      id: "home",
      label: "Go to Home",
      icon: Home,
      action: () => router.push(hasActiveSub ? "/marketplace" : "/explore"),
      keywords: ["marketplace", "explore", "browse"],
      section: "Navigation",
    },
    {
      id: "library",
      label: "Go to Library",
      icon: Library,
      action: () => router.push("/library"),
      keywords: ["downloads", "purchased"],
      section: "Navigation",
    },
    {
      id: "favorites",
      label: "Go to Favorites",
      icon: Heart,
      action: () => router.push("/favorites"),
      keywords: ["liked", "saved"],
      section: "Navigation",
    },
    {
      id: "following",
      label: "Go to Following",
      icon: Users,
      action: () => router.push("/following"),
      keywords: ["artists", "creators"],
      section: "Navigation",
    },
    {
      id: "sounds",
      label: "Browse All Sounds",
      icon: Music,
      action: () => router.push("/sounds"),
      keywords: ["samples", "search"],
      section: "Navigation",
    },
    // Creator
    ...(user?.role === "CREATOR"
      ? [
          {
            id: "dashboard",
            label: "Creator Dashboard",
            icon: LayoutDashboard,
            action: () => router.push("/creator/dashboard"),
            keywords: ["stats", "analytics"],
            section: "Creator",
          },
          {
            id: "upload",
            label: "Upload Sample",
            icon: Upload,
            action: () => router.push("/creator/upload"),
            keywords: ["new", "add"],
            section: "Creator",
          },
          {
            id: "earnings",
            label: "View Earnings",
            icon: DollarSign,
            action: () => router.push("/creator/earnings"),
            keywords: ["money", "revenue"],
            section: "Creator",
          },
        ]
      : []),
    // Account
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
      action: () => router.push("/account"),
      keywords: ["account", "profile", "preferences"],
      section: "Account",
    },
    ...(user
      ? [
          {
            id: "logout",
            label: "Sign Out",
            icon: LogOut,
            action: () => logout(),
            keywords: ["exit", "leave"],
            section: "Account",
          },
        ]
      : []),
  ];

  const filteredCommands = commands.filter((cmd) => {
    const searchLower = search.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(searchLower) ||
      cmd.keywords?.some((k) => k.includes(searchLower))
    );
  });

  // Group by section
  const sections = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.section]) acc[cmd.section] = [];
    acc[cmd.section].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  // Open/close with ⌘K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setSearch("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected) {
        selected.action();
        setIsOpen(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={() => setIsOpen(false)}
      />

      {/* Modal */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50">
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2a2a]">
            <Search className="w-5 h-5 text-[#666]" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search commands..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-white placeholder-[#666] outline-none text-sm"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded bg-[#2a2a2a] text-[#666] text-xs">
              esc
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto py-2">
            {Object.entries(sections).map(([section, items]) => (
              <div key={section}>
                <div className="px-4 py-2">
                  <span className="text-xs font-semibold text-[#666] uppercase tracking-wider">
                    {section}
                  </span>
                </div>
                {items.map((cmd, idx) => {
                  const globalIndex = filteredCommands.indexOf(cmd);
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => {
                        cmd.action();
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
                        globalIndex === selectedIndex
                          ? "bg-[#39b54a]/10 text-white"
                          : "text-[#a1a1a1] hover:bg-[#2a2a2a] hover:text-white"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm">{cmd.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}

            {filteredCommands.length === 0 && (
              <div className="px-4 py-8 text-center text-[#666] text-sm">
                No commands found
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-[#2a2a2a] flex items-center justify-between text-xs text-[#666]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-[#2a2a2a]">↑↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-[#2a2a2a]">↵</kbd>
                select
              </span>
            </div>
            <span className="flex items-center gap-1">
              <Command className="w-3 h-3" />K to toggle
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
