"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  Home,
  Library,
  Heart,
  Users,
  Upload,
  Settings,
  LogOut,
  Search,
  Music,
  LayoutDashboard,
  DollarSign,
  Shield,
  User,
} from "lucide-react";
import { useUser } from "@/lib/hooks/useUser";

export function MobileHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { user, loading, logout } = useUser();

  const hasActiveSub =
    user?.subscription_status === "active" ||
    user?.subscription_status === "past_due" ||
    user?.role === "CREATOR" ||
    user?.role === "ADMIN" ||
    user?.role === "MODERATOR";

  const NavItem = ({
    href,
    icon: Icon,
    label,
    onClick,
  }: {
    href?: string;
    icon: React.ElementType;
    label: string;
    onClick?: () => void;
  }) => {
    const isActive = href ? pathname === href : false;
    const content = (
      <div
        className={`flex items-center gap-3 px-4 py-3 text-base font-medium transition-all ${
          isActive
            ? "bg-[#39b54a]/10 text-[#39b54a]"
            : "text-[#a1a1a1] active:bg-[#1a1a1a]"
        }`}
        onClick={() => {
          onClick?.();
          setIsOpen(false);
        }}
      >
        <Icon className="w-5 h-5" />
        <span>{label}</span>
      </div>
    );

    if (href) {
      return <Link href={href}>{content}</Link>;
    }
    return <button className="w-full text-left">{content}</button>;
  };

  return (
    <>
      {/* Mobile Header Bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#0a0a0a] border-b border-[#1a1a1a] z-50 flex items-center justify-between px-4">
        <Link href={user && hasActiveSub ? "/marketplace" : "/explore"}>
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697bed99d794c79d63ec6b73/c33d47e0e_GREENROOMLOGOWHITE.png"
            alt="GREENROOM"
            className="h-4"
          />
        </Link>

        {/* Credits (if logged in) */}
        {user && hasActiveSub && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#1a1a1a]">
            <img src="/g-icon.png" alt="G" className="w-3.5 h-3.5" />
            <span className="text-xs font-medium text-white">{user.credits}</span>
          </div>
        )}

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 -mr-2 text-white"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/60 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="md:hidden fixed top-14 left-0 right-0 bottom-0 bg-[#0a0a0a] z-40 overflow-y-auto pb-24">
            <nav className="py-2">
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
                  <div className="border-t border-[#1a1a1a] my-2" />
                  <NavItem href="/login" icon={User} label="Sign In" />
                  <NavItem href="/signup" icon={Music} label="Get Started" />
                </>
              )}

              {user?.role === "CREATOR" && (
                <>
                  <div className="border-t border-[#1a1a1a] my-2" />
                  <div className="px-4 py-2 text-xs font-semibold text-[#666] uppercase">
                    Creator
                  </div>
                  <NavItem href="/creator/dashboard" icon={LayoutDashboard} label="Dashboard" />
                  <NavItem href="/creator/upload" icon={Upload} label="Upload" />
                  <NavItem href="/creator/earnings" icon={DollarSign} label="Earnings" />
                </>
              )}

              {(user?.role === "MODERATOR" || user?.role === "ADMIN") && (
                <>
                  <div className="border-t border-[#1a1a1a] my-2" />
                  <div className="px-4 py-2 text-xs font-semibold text-[#666] uppercase">
                    Moderation
                  </div>
                  <NavItem href="/mod/samples" icon={Shield} label="Review Samples" />
                  <NavItem href="/mod/applications" icon={Users} label="Applications" />
                </>
              )}

              {user && (
                <>
                  <div className="border-t border-[#1a1a1a] my-2" />
                  <NavItem href="/account" icon={Settings} label="Settings" />
                  <NavItem icon={LogOut} label="Sign Out" onClick={logout} />
                </>
              )}
            </nav>
          </div>
        </>
      )}

      {/* Spacer for fixed header on mobile */}
      <div className="md:hidden h-14" />
    </>
  );
}
