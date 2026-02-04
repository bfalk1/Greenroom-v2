"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Music, Settings, LogOut, Menu, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

// TODO: Replace with actual auth state from Supabase
interface NavUser {
  id: string;
  email: string;
  credits: number;
  subscription_status: string;
  is_creator: boolean;
  role: string;
}

const useMockUser = (): NavUser | null => {
  // Return null for unauthenticated, or a mock user object
  return {
    id: "mock-user",
    email: "user@example.com",
    credits: 150,
    subscription_status: "active",
    is_creator: true,
    role: "admin",
  };
};

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // TODO: Replace with Supabase auth
  const user = useMockUser();

  const handleLogout = async () => {
    // TODO: Replace with Supabase logout
    console.log("logout");
  };

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
          <Link href="/" className="flex items-center gap-2 group">
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
                {navLink("/pricing", "Pricing")}
                {!user.is_creator && navLink("/creator/apply", "Become a Creator")}
                {user.is_creator && navLink("/creator/dashboard", "Dashboard")}
                {user.is_creator && navLink("/creator/earnings", "Earnings")}
                {(user.role === "moderator" || user.role === "admin") &&
                  navLink("/mod/samples", "Moderation")}
                {user.role === "admin" && navLink("/admin/dashboard", "Admin")}
              </>
            ) : null}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            {user ? (
              <>
                {/* Credits Badge */}
                {user.subscription_status === "active" && (
                  <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#00FF88]/30">
                    <Zap className="w-4 h-4 text-[#00FF88]" />
                    <span className="text-sm font-medium text-white">
                      {user.credits} credits
                    </span>
                  </div>
                )}

                {/* Account Menu */}
                <Link
                  href="/account"
                  className="p-2 rounded-lg hover:bg-[#1a1a1a] transition"
                >
                  <Settings className="w-5 h-5 text-[#a1a1a1]" />
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
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
            <Link
              href="/marketplace"
              className="text-sm font-medium text-[#a1a1a1] hover:text-white"
            >
              Marketplace
            </Link>
            <Link
              href="/library"
              className="text-sm font-medium text-[#a1a1a1] hover:text-white"
            >
              Library
            </Link>
            <Link
              href="/pricing"
              className="text-sm font-medium text-[#a1a1a1] hover:text-white"
            >
              Pricing
            </Link>
            {!user.is_creator && (
              <Link
                href="/creator/apply"
                className="text-sm font-medium text-[#a1a1a1] hover:text-white"
              >
                Become a Creator
              </Link>
            )}
            {user.is_creator && (
              <Link
                href="/creator/dashboard"
                className="text-sm font-medium text-[#a1a1a1] hover:text-white"
              >
                Dashboard
              </Link>
            )}
            {user.is_creator && (
              <Link
                href="/creator/earnings"
                className="text-sm font-medium text-[#a1a1a1] hover:text-white"
              >
                Earnings
              </Link>
            )}
            {(user.role === "moderator" || user.role === "admin") && (
              <Link
                href="/mod/samples"
                className="text-sm font-medium text-[#a1a1a1] hover:text-white"
              >
                Moderation
              </Link>
            )}
            {user.role === "admin" && (
              <Link
                href="/admin/dashboard"
                className="text-sm font-medium text-[#a1a1a1] hover:text-white"
              >
                Admin
              </Link>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
