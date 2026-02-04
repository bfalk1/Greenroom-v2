"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";

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
  profile_completed: boolean;
}

export function useUser() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchUser = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser) {
        setUser(null);
        setSupabaseUser(null);
        setLoading(false);
        return;
      }

      setSupabaseUser(authUser);

      // Fetch user profile from our DB via API
      const res = await fetch("/api/user/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        // User exists in Supabase Auth but not in our DB yet
        // This happens on first login — set minimal user
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
          profile_completed: false,
        });
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          fetchUser();
        } else {
          setUser(null);
          setSupabaseUser(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSupabaseUser(null);
    window.location.href = "/";
  };

  const refreshUser = () => fetchUser();

  return { user, supabaseUser, loading, logout, refreshUser };
}
