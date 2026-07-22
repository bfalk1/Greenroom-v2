"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { identifyUser, resetAnalytics, trackLogout } from "@/lib/analytics";
import {
  metaSetAdvancedMatching,
  metaClearAdvancedMatching,
} from "@/lib/metaPixel";

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
  terms_accepted_at: string | null;
  // Billing locality — used only to feed Meta Pixel Advanced Matching
  // (src/lib/metaPixel.ts); sparse, since the profile address is optional.
  city: string | null;
  state: string | null;
  postal_code: string | null;
}

interface UserContextType {
  user: AppUser | null;
  supabaseUser: SupabaseUser | null;
  loading: boolean;
  // True when we have an authenticated Supabase session but couldn't load the
  // app user from /api/user/me (server/network error). The UI should show an
  // error/retry — NOT treat the person as a logged-out or plain USER.
  error: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  supabaseUser: null,
  loading: true,
  error: false,
  logout: async () => {},
  refreshUser: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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
          setError(false);
          setLoading(false);
          return;
        }

        setSupabaseUser(authUser);

        // Fetch our app user, retrying transient server/network failures. A 500
        // here must NOT be swallowed into a fabricated "USER" — doing so silently
        // strips admins/creators of their role (e.g. when the DB is unreachable).
        let res: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            res = await fetch("/api/user/me");
          } catch {
            res = null; // network error — fall through to retry
          }
          // 2xx or 401 are definitive answers; only retry on 5xx / network error.
          if (res && (res.ok || res.status === 401)) break;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }

        if (res && res.ok) {
          const data = await res.json();
          setUser(data.user);
          setError(false);
          identifyUser(data.user);
          // Attach the signed-in user's hashed identifiers to the Meta Pixel
          // (Advanced Matching), so the browser half of every event carries
          // email/name/address — not just the CAPI half. Fire-and-forget: it
          // hashes external_id asynchronously and must not block user load.
          void metaSetAdvancedMatching({
            id: data.user.id,
            email: data.user.email,
            fullName: data.user.full_name,
            city: data.user.city,
            state: data.user.state,
            postalCode: data.user.postal_code,
          });
        } else if (res && res.status === 401) {
          // Session is no longer valid server-side — treat as logged out.
          setUser(null);
          setSupabaseUser(null);
          setError(false);
        } else {
          // Persistent server/network failure. Don't guess at a role — surface an
          // error and keep whatever user we already had (don't downgrade a
          // known-good admin/creator because one request failed).
          console.error(
            "Failed to load /api/user/me:",
            res ? `status ${res.status}` : "network error"
          );
          setError(true);
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        setError(true);
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
        metaClearAdvancedMatching();
        setUser(null);
        setSupabaseUser(null);
        setError(false);
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
      value={{ user, supabaseUser, loading, error, logout, refreshUser: fetchUser }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
