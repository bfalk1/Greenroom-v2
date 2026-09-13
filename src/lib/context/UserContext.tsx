"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { identifyUser, resetAnalytics, trackLogout } from "@/lib/analytics";
import {
  metaSetAdvancedMatching,
  metaClearAdvancedMatching,
} from "@/lib/metaPixel";
import { tiktokSetIdentity, tiktokClearIdentity } from "@/lib/tiktokPixel";
import { markAdIdentityAttached, resetAdIdentity } from "@/lib/adIdentity";
import {
  googleAdsSetUserData,
  googleAdsClearUserData,
} from "@/lib/googleAds";

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
  // Null on a creator = the congratulations modal hasn't been shown yet.
  creator_welcome_seen_at: string | null;
  // Samples + presets this creator has uploaded. Only computed by /api/user/me
  // while the welcome is pending; null otherwise.
  creator_content_count: number | null;
  // Locality — feeds Meta Pixel Advanced Matching (src/lib/metaPixel.ts) and
  // pre-fills the onboarding form. Collected at signup since 2026-08; sparse
  // on older accounts.
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
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
          const metaIdentity = metaSetAdvancedMatching({
            id: data.user.id,
            email: data.user.email,
            fullName: data.user.full_name,
            city: data.user.city,
            state: data.user.state,
            postalCode: data.user.postal_code,
            country: data.user.country,
          });
          // Same for TikTok, which otherwise receives no identifiers at all
          // and flags a Critical "Email and phone are missing" diagnostic.
          // TikTok's identity set is narrower than Meta's — email, phone, and
          // external_id only — so name/address are not sent here.
          const tiktokIdentity = tiktokSetIdentity({
            id: data.user.id,
            email: data.user.email,
          });
          // Same identifiers staged for Google's Enhanced Conversions, so a
          // later Purchase conversion carries them (gtag hashes on send).
          googleAdsSetUserData({
            email: data.user.email,
            fullName: data.user.full_name,
            city: data.user.city,
            state: data.user.state,
            postalCode: data.user.postal_code,
            country: data.user.country,
          });
          // Release the conversion events that wait on identity rather than
          // racing it (src/lib/adIdentity.ts). Meta's and TikTok's attachments
          // hash asynchronously, so readiness is the moment those SETTLE —
          // not the moment they were called. allSettled, not all: a rejected
          // hash must still end the wait, degrading that conversion to
          // unidentified rather than holding it until the timeout.
          void Promise.allSettled([metaIdentity, tiktokIdentity]).then(
            markAdIdentityAttached
          );
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
        tiktokClearIdentity();
        googleAdsClearUserData();
        resetAdIdentity();
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
