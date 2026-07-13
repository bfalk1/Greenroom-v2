"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * Google sign-in via Supabase OAuth, shared by /login and /signup. Rendered
 * only when NEXT_PUBLIC_GOOGLE_AUTH_ENABLED is "true" — the flag stays off
 * until the Google provider is configured in the Supabase dashboard, so the
 * button can ship dark without offering a dead sign-in path.
 *
 * The post-auth redirect (e.g. the VIP flow's /checkout deep link) rides the
 * /callback ?redirect param, same as the email flows.
 */
export function googleAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED?.trim() === "true";
}

export function GoogleAuthButton({
  redirect,
  label,
}: {
  redirect: string | null;
  label: string;
}) {
  const [loading, setLoading] = useState(false);

  if (!googleAuthEnabled()) return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/callback${
            redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""
          }`,
        },
      });
      // On success the browser navigates away; only an error returns here.
      if (error) setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 my-5">
        <div className="h-px flex-1 bg-[#2a2a2a]" />
        <span className="text-xs text-[#666] uppercase tracking-wider">or</span>
        <div className="h-px flex-1 bg-[#2a2a2a]" />
      </div>
      <Button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full bg-white text-black hover:bg-[#e5e5e5] font-semibold py-3"
      >
        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.37c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.1 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.37 12 5.37z"
          />
        </svg>
        {loading ? "Redirecting…" : label}
      </Button>
      {/* OAuth signups never see the email form's terms checkbox — consent
          has to be stated here instead. */}
      <p className="mt-3 text-center text-xs text-[#6a6a6a]">
        By continuing with Google you agree to the{" "}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#39b54a] hover:underline"
        >
          User Terms of Use
        </a>{" "}
        and{" "}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#39b54a] hover:underline"
        >
          Privacy Policy
        </a>
        .
      </p>
    </>
  );
}
