"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Music,
  Library,
  Heart,
  Users,
  Upload,
  LayoutDashboard,
  DollarSign,
  User,
  Settings,
  Shield,
  LogOut,
  Search,
  Home,
} from "lucide-react";
import { useUser } from "@/lib/hooks/useUser";

export function Sidebar() {
  const pathname = usePathname();
  const { user, loading, logout } = useUser();

  const hasActiveSub =
    user?.subscription_status === "active" ||
    user?.subscription_status === "past_due" ||
    user?.role === "CREATOR" ||
    user?.role === "ADMIN" ||
    user?.role === "MODERATOR";

  const isActive = (href: string) => pathname === href;

  const NavItem = ({
    href,
    icon: Icon,
    label,
    badge,
  }: {
    href: string;
    icon: React.ElementType;
    label: string;
    badge?: number;
  }) => (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        isActive(href)
          ? "bg-[#39b54a]/10 text-[#39b54a]"
          : "text-[#a1a1a1] hover:text-white hover:bg-[#1a1a1a]"
      }`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto bg-[#39b54a] text-black text-xs font-bold px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </Link>
  );

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="px-3 pt-4 pb-2">
      <span className="text-xs font-semibold text-[#666] uppercase tracking-wider">
        {children}
      </span>
    </div>
  );

  return (
    <aside className="w-56 bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col h-screen fixed left-0 top-0 z-30">
      {/* Logo */}
      <div className="p-4 border-b border-[#1a1a1a]">
        <Link href={user && hasActiveSub ? "/marketplace" : "/explore"} className="block">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697bed99d794c79d63ec6b73/c33d47e0e_GREENROOMLOGOWHITE.png"
            alt="GREENROOM"
            className="h-5"
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {/* Main */}
        <div className="space-y-1">
          {user && hasActiveSub ? (
            <>
              <NavItem href="/marketplace" icon={Home} label="Home" />
              <NavItem href="/sounds" icon={Search} label="Browse" />
              <NavItem href="/library" icon={Library} label="Library" />
              <NavItem href="/favorites" icon={Heart} label="Favorites" />
              <NavItem href="/following" icon={Users} label="Following" />
            </>
          ) : user ? (
            <>
              <NavItem href="/explore" icon={Home} label="Explore" />
              <NavItem href="/pricing" icon={DollarSign} label="Subscribe" />
            </>
          ) : (
            <>
              <NavItem href="/explore" icon={Home} label="Explore" />
              <NavItem href="/pricing" icon={DollarSign} label="Pricing" />
            </>
          )}
        </div>

        {/* Creator Section */}
        {user?.role === "CREATOR" && (
          <>
            <SectionLabel>Creator</SectionLabel>
            <div className="space-y-1">
              <NavItem href="/creator/dashboard" icon={LayoutDashboard} label="Dashboard" />
              <NavItem href="/creator/upload" icon={Upload} label="Upload" />
              <NavItem href="/creator/earnings" icon={DollarSign} label="Earnings" />
              <NavItem
                href={`/artist/${encodeURIComponent(user.artist_name || user.username || user.id)}`}
                icon={User}
                label="Profile"
              />
            </div>
          </>
        )}

        {/* Become a Creator */}
        {user && hasActiveSub && user.role !== "CREATOR" && user.role !== "ADMIN" && user.role !== "MODERATOR" && (
          <>
            <SectionLabel>Create</SectionLabel>
            <div className="space-y-1">
              <NavItem href="/creator/apply" icon={Music} label="Become a Creator" />
            </div>
          </>
        )}

        {/* Moderation */}
        {(user?.role === "MODERATOR" || user?.role === "ADMIN") && (
          <>
            <SectionLabel>Moderation</SectionLabel>
            <div className="space-y-1">
              <NavItem href="/mod/samples" icon={Shield} label="Review Samples" />
              <NavItem href="/mod/applications" icon={Users} label="Applications" />
            </div>
          </>
        )}

        {/* Admin */}
        {user?.role === "ADMIN" && (
          <>
            <SectionLabel>Admin</SectionLabel>
            <div className="space-y-1">
              <NavItem href="/admin/dashboard" icon={LayoutDashboard} label="Dashboard" />
              <NavItem href="/admin/users" icon={Users} label="Users" />
            </div>
          </>
        )}
      </nav>

      {/* User Section */}
      <div className="border-t border-[#1a1a1a] p-2">
        {loading ? (
          <div className="h-12 bg-[#1a1a1a] rounded-lg animate-pulse" />
        ) : user ? (
          <div className="space-y-1">
            {/* Credits */}
            {hasActiveSub && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a1a1a]">
                <img src="/g-icon.png" alt="G" className="w-4 h-4" />
                <span className="text-sm font-medium text-white">
                  {user.credits}
                </span>
                <span className="text-xs text-[#666]">credits</span>
              </div>
            )}
            <NavItem href="/account" icon={Settings} label="Settings" />
            <button
              onClick={logout}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[#a1a1a1] hover:text-white hover:bg-[#1a1a1a] transition-all w-full"
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2 p-2">
            <Link
              href="/login"
              className="block w-full text-center py-2 px-4 rounded-lg bg-[#1a1a1a] text-white text-sm font-medium hover:bg-[#2a2a2a] transition"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="block w-full text-center py-2 px-4 rounded-lg bg-[#39b54a] text-black text-sm font-medium hover:bg-[#2e9140] transition"
            >
              Get Started
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
