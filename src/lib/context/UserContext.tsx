"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { identifyUser, resetAnalytics, trackLogout } from "@/lib/analytics";

export interface AppUser {
  id: string;
  email: string;
  credits: number;
  subscription_status: string;
  is_creator: boolean;
  role: string;
  full_name: string | null;
  username: string | null;
  artist_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  profile_completed: boolean;
  is_whitelisted?: boolean;
}

interface UserContextType {
  user: AppUser | null;
  supabaseUser: SupabaseUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  supabaseUser: null,
  loading: true,
  logout: async () => {},
  refreshUser: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const fetchingRef = React.useRef(false);
  const pendingRef = React.useRef<Promise<void> | null>(null);

  const fetchUser = useCallback(async () => {
    // Skip during SSR/build when Supabase client isn't available
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Deduplicate concurrent calls - return existing promise if already fetching
    if (fetchingRef.current && pendingRef.current) {
      return pendingRef.current;
    }

    fetchingRef.current = true;
    pendingRef.current = (async () => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (!authUser) {
          setUser(null);
          setSupabaseUser(null);
          setLoading(false);
          return;
        }

        setSupabaseUser(authUser);

        const res = await fetch("/api/user/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          identifyUser(data.user);
        } else {
          setUser({
            id: authUser.id,
            email: authUser.email || "",
            credits: 0,
            subscription_status: "none",
            is_creator: false,
            role: "USER",
            full_name: null,
            username: null,
            artist_name: null,
            avatar_url: null,
            banner_url: null,
            profile_completed: false,
          });
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        setUser(null);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
        pendingRef.current = null;
      }
    })();

    return pendingRef.current;
  }, []);

  useEffect(() => {
    // Skip during SSR/build when Supabase client isn't available
    if (!supabase) {
      setLoading(false);
      return;
    }

    fetchUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        fetchUser();
      } else if (event === "SIGNED_OUT") {
        // Only clear user state on explicit sign-out, not transient states
        resetAnalytics();
        setUser(null);
        setSupabaseUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUser, supabase]);

  const logout = async () => {
    if (!supabase) return;
    trackLogout();
    resetAnalytics();
    await supabase.auth.signOut();
    setUser(null);
    setSupabaseUser(null);
    const isDesktop = Boolean((window as { greenroom?: { isDesktop?: boolean } }).greenroom?.isDesktop);
    window.location.href = isDesktop ? "/login" : "/";
  };

  return (
    <UserContext.Provider
      value={{ user, supabaseUser, loading, logout, refreshUser: fetchUser }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
