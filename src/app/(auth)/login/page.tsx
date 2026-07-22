"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { trackLogin } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeRedirectPath } from "@/lib/safeRedirect";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

// Notices driven by ?error= from the middleware (suspended) and the auth
// callback (confirm_link). Informational, not form errors — the visitor did
// nothing wrong.
const NOTICE_BY_CODE: Record<string, string> = {
  confirm_link:
    "That confirmation link couldn't be completed in this browser (links only work on the device you signed up from). Your account may already be confirmed — sign in below to continue where you left off.",
  suspended: "This account is suspended. Contact support if you think that's a mistake.",
};

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Post-login destination. A carried ?redirect (the /vip lifetime flow deep
  // links /checkout?tier=VIP&lifetime=1) wins; a legacy ?lifetime=1 (from the
  // old middleware redirect, still in shared links) reconstructs the same
  // destination so those buyers aren't dumped on /marketplace at full price.
  const safeRedirect =
    safeRedirectPath(searchParams.get("redirect")) ??
    (searchParams.get("lifetime") === "1"
      ? "/checkout?tier=VIP&lifetime=1"
      : null);

  const notice = NOTICE_BY_CODE[searchParams.get("error") ?? ""] ?? null;

  // New here? Account creation goes through the paywall, not a standalone free
  // signup — so the cross-link lands on /pricing (pick a plan → public /checkout,
  // which renders the signup form inline). Bare /signup is redirected to /pricing
  // by the middleware anyway; linking straight there avoids the extra hop. The
  // VIP discount survives via its HMAC unlock cookie, independent of any redirect.
  const signupHref = "/pricing";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      const dest = safeRedirect ?? "/marketplace";

      // Check if profile is complete. Onboarding carries the redirect through
      // (it honors ?redirect after submit), so an incomplete profile delays
      // the destination instead of discarding it. EXCEPT mid-checkout: a
      // buyer signing in from the checkout page (e.g. created inline there,
      // never onboarded) goes straight back to their tier — profile
      // completion happens post-purchase, same rule as /callback.
      const res = await fetch("/api/user/me");
      if (res.ok) {
        const data = await res.json();
        if (
          !data.user.profile_completed &&
          !safeRedirect?.startsWith("/checkout")
        ) {
          router.push(
            safeRedirect
              ? `/onboarding?redirect=${encodeURIComponent(safeRedirect)}`
              : "/onboarding"
          );
          return;
        }
      }

      trackLogin();
      router.push(dest);
      router.refresh();
    } catch (err) {
      console.error("Login error:", err);
      setError("Failed to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697bed99d794c79d63ec6b73/c33d47e0e_GREENROOMLOGOWHITE.png"
              alt="GREENROOM"
              className="h-6 mx-auto"
            />
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-[#a1a1a1]">Sign in to your GREENROOM account</p>
        </div>

        {/* Info notice (confirmation-link fallback, suspension) */}
        {notice && (
          <div className="mb-4 p-3 rounded-lg bg-[#1a2418] border border-[#2e9140]/30 text-[#a8d5ae] text-sm">
            {notice}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/30 border border-red-900/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Email
            </label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Password
            </label>
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold py-3"
          >
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <GoogleAuthButton redirect={safeRedirect} label="Continue with Google" />

        <p className="text-center text-[#a1a1a1] text-sm mt-6">
          Don&apos;t have an account?{" "}
          <Link
            href={signupHref}
            className="text-[#39b54a] hover:text-[#2e9140] font-medium"
          >
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
