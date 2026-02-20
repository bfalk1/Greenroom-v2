"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, LogOut, Menu, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/hooks/useUser";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user, loading, logout } = useUser();

  const hasActiveSub =
    user?.subscription_status === "active" ||
    user?.subscription_status === "past_due";

  const navLink = (href: string, label: string) => {
    const isActive = pathname === href;
    return (
      <Link
        href={href}
        className={`text-sm font-medium transition ${
          isActive ? "text-[#00FF88]" : "text-[#a1a1a1] hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="border-b border-[#2a2a2a] bg-[#0a0a0a] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href={user ? "/marketplace" : "/"} className="flex items-center gap-2 group">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697bed99d794c79d63ec6b73/c33d47e0e_GREENROOMLOGOWHITE.png"
              alt="GREENROOM"
              className="h-4"
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {user ? (
              <>
                {navLink("/marketplace", "Marketplace")}
                {navLink("/library", "Library")}
                {!hasActiveSub && navLink("/pricing", "Pricing")}
                {user.role !== "CREATOR" && user.role !== "ADMIN" && user.role !== "MODERATOR" && navLink("/creator/apply", "Become a Creator")}
                {/* Only show creator dashboard/earnings for CREATOR role, not for ADMIN/MODERATOR */}
                {user.role === "CREATOR" && navLink("/creator/dashboard", "Dashboard")}
                {user.role === "CREATOR" && navLink("/creator/earnings", "Earnings")}
                {(user.role === "MODERATOR" || user.role === "ADMIN") &&
                  navLink("/mod/samples", "Moderation")}
                {user.role === "ADMIN" && navLink("/admin/dashboard", "Admin")}
              </>
            ) : (
              <>
                {navLink("/marketplace", "Marketplace")}
                {navLink("/pricing", "Pricing")}
              </>
            )}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            {loading ? (
              <div className="w-20 h-8 bg-[#1a1a1a] rounded-full animate-pulse" />
            ) : user ? (
              <>
                {/* Credits Badge */}
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#00FF88]/30">
                  <Zap className="w-4 h-4 text-[#00FF88]" />
                  <span className="text-sm font-medium text-white">
                    {user.credits} credits
                  </span>
                </div>

                {/* Account */}
                <Link
                  href="/account"
                  className="p-2 rounded-lg hover:bg-[#1a1a1a] transition"
                >
                  <Settings className="w-5 h-5 text-[#a1a1a1]" />
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="text-[#a1a1a1] hover:text-white"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <Link href="/login">
                <Button className="bg-[#00FF88] text-black hover:bg-[#00cc6a] font-medium">
                  Sign In
                </Button>
              </Link>
            )}

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 hover:bg-[#1a1a1a] rounded-lg transition"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-white" />
              ) : (
                <Menu className="w-5 h-5 text-white" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && user && (
          <nav className="md:hidden mt-4 pt-4 border-t border-[#2a2a2a] flex flex-col gap-3">
            <Link href="/marketplace" className="text-sm font-medium text-[#a1a1a1] hover:text-white">
              Marketplace
            </Link>
            <Link href="/library" className="text-sm font-medium text-[#a1a1a1] hover:text-white">
              Library
            </Link>
            {!hasActiveSub && (
              <Link href="/pricing" className="text-sm font-medium text-[#a1a1a1] hover:text-white">
                Pricing
              </Link>
            )}
            {user.role !== "CREATOR" && user.role !== "ADMIN" && user.role !== "MODERATOR" && (
              <Link href="/creator/apply" className="text-sm font-medium text-[#a1a1a1] hover:text-white">
                Become a Creator
              </Link>
            )}
            {/* Only show creator dashboard/earnings for CREATOR role */}
            {user.role === "CREATOR" && (
              <Link href="/creator/dashboard" className="text-sm font-medium text-[#a1a1a1] hover:text-white">
                Dashboard
              </Link>
            )}
            {user.role === "CREATOR" && (
              <Link href="/creator/earnings" className="text-sm font-medium text-[#a1a1a1] hover:text-white">
                Earnings
              </Link>
            )}
            {(user.role === "MODERATOR" || user.role === "ADMIN") && (
              <Link href="/mod/samples" className="text-sm font-medium text-[#a1a1a1] hover:text-white">
                Moderation
              </Link>
            )}
            {user.role === "ADMIN" && (
              <Link href="/admin/dashboard" className="text-sm font-medium text-[#a1a1a1] hover:text-white">
                Admin
              </Link>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
