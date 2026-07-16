"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { trackSignup, trackSignupFailed } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

export interface InviteData {
  email: string;
  artistName: string;
}

export interface BetaInviteData {
  email: string;
  credits: number;
}

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697bed99d794c79d63ec6b73/c33d47e0e_GREENROOMLOGOWHITE.png";

/**
 * The account-creation flow shared by the standalone /signup page and the
 * checkout-embedded signup step: email/password form with mandatory terms
 * acceptance, Google OAuth, the anti-enumeration "already registered" screen,
 * and the check-your-email screen with resend. The caller owns everything
 * around it (page chrome, invite verification, post-session routing).
 */
export function SignupForm({
  redirect,
  source,
  invite = null,
  betaInvite = null,
  inviteLoading = false,
  onSession,
  header,
  screenLogo = false,
}: {
  // Post-auth destination, already validated by the caller (safeRedirectPath).
  // Threaded through every path out of the form: emailRedirectTo → /callback,
  // Google OAuth, and the sign-in cross-links.
  redirect: string | null;
  // Attributes the signup to a funnel in analytics (e.g. "vip", "checkout").
  source?: string;
  invite?: InviteData | null;
  betaInvite?: BetaInviteData | null;
  inviteLoading?: boolean;
  // Called after signup returns an immediate session (email confirmation off).
  // The caller decides what happens — navigate, or stay put and refresh the
  // user context (the checkout-embedded form).
  onSession: () => void | Promise<void>;
  // Rendered above the form (logo/heading/invite banner). Hidden once the flow
  // moves to the check-email or already-registered screens, which bring their
  // own headings.
  header?: React.ReactNode;
  // Show the brand logo on those screens — the standalone page does; the
  // checkout-embedded form doesn't (the order summary stays alongside).
  screenLogo?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [resendState, setResendState] = useState<
    "idle" | "sending" | "sent" | "failed"
  >("idle");

  // Invite verification resolves async in the caller — sync the (hidden)
  // email field once it lands.
  useEffect(() => {
    if (invite) setEmail(invite.email);
    else if (betaInvite) setEmail(betaInvite.email);
  }, [invite, betaInvite]);

  const emailRedirectTo = () =>
    `${window.location.origin}/callback${
      redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""
    }`;

  const loginHref = redirect
    ? `/login?redirect=${encodeURIComponent(redirect)}`
    : "/login";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      trackSignupFailed("password_mismatch");
      setError("Passwords don't match");
      return;
    }

    if (password.length < 6) {
      trackSignupFailed("password_too_short");
      setError("Password must be at least 6 characters");
      return;
    }

    if (!termsAccepted) {
      trackSignupFailed("terms_not_accepted");
      setError("You must accept the Terms of Use and Privacy Policy");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Carry the redirect through the email-confirmation path too, so the
          // /callback route can land a confirmed user back where they started
          // (e.g. /checkout with the tier intact).
          emailRedirectTo: emailRedirectTo(),
        },
      });

      if (error) {
        trackSignupFailed("provider_error");
        setError(error.message);
        return;
      }

      // Already-registered email: Supabase anti-enumeration returns success
      // with a user whose identities are empty (and no session). Showing
      // "Check Your Email" here is a dead end, since no email comes — say it
      // straight and point them at sign-in with the redirect intact.
      if (
        !data.session &&
        data.user &&
        (data.user.identities?.length ?? 0) === 0
      ) {
        // Not lost traffic — a returning user on the wrong form.
        trackSignupFailed("already_registered");
        setAlreadyRegistered(true);
        return;
      }

      const method = invite || betaInvite ? ("invite" as const) : ("email" as const);

      // If session exists, email confirmation is off — hand off to the caller.
      if (data.session) {
        await fetch("/api/user/me");
        trackSignup(method, source);
        await onSession();
        return;
      }

      // Email confirmation is on — show check email screen
      trackSignup(method, source);
      setSuccess(true);
    } catch (err) {
      console.error("Signup error:", err);
      trackSignupFailed("error");
      setError("Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendState("sending");
    try {
      const supabase = createClient();
      // resend() reports failures via { error }, not by throwing — a rate
      // limit or provider error must not show "re-sent".
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: emailRedirectTo() },
      });
      setResendState(error ? "failed" : "sent");
    } catch {
      setResendState("failed");
    }
  };

  if (alreadyRegistered) {
    return (
      <div className="w-full max-w-md text-center">
        {screenLogo && (
          <img src={LOGO_URL} alt="GREENROOM" className="h-6 mx-auto mb-6" />
        )}
        <h1 className="text-3xl font-bold text-white mb-4">
          You Already Have an Account
        </h1>
        <p className="text-[#a1a1a1] mb-6">
          <span className="text-white font-medium">{email}</span> is already
          registered. Sign in to continue
          {redirect ? " where you left off — your offer is waiting" : ""}.
        </p>
        <Link href={loginHref}>
          <Button className="bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold">
            Sign In to Continue
          </Button>
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="w-full max-w-md text-center">
        {screenLogo && (
          <img src={LOGO_URL} alt="GREENROOM" className="h-6 mx-auto mb-6" />
        )}
        <h1 className="text-3xl font-bold text-white mb-4">Check Your Email</h1>
        <p className="text-[#a1a1a1] mb-2">
          We sent a confirmation link to{" "}
          <span className="text-white font-medium">{email}</span>. Click it to
          activate your account
          {redirect ? " and pick up right where you left off" : ""}.
        </p>
        <p className="text-[#a1a1a1] text-sm mb-6">
          Nothing arriving? Check your spam or junk folder — and open the link
          on this device so it can sign you in here.
        </p>
        <div className="flex flex-col items-center gap-3">
          <Button
            onClick={handleResend}
            disabled={resendState === "sending" || resendState === "sent"}
            className="bg-[#1a1a1a] border border-[#2a2a2a] text-white hover:bg-[#2a2a2a] font-semibold"
          >
            {resendState === "sent"
              ? "Confirmation re-sent"
              : resendState === "sending"
                ? "Re-sending…"
                : resendState === "failed"
                  ? "Couldn't send — try again"
                  : "Re-send confirmation email"}
          </Button>
          <Link href={loginHref}>
            <Button className="bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold">
              Back to Sign In
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      {header}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-950/30 border border-red-900/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Hide email field if invite (email is pre-set for both creator and beta invites) */}
        {!invite && !betaInvite && (
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
        )}

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

        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Confirm Password
          </label>
          <Input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
          />
        </div>

        {/* Terms Acceptance */}
        <div className="flex items-start gap-3">
          <Checkbox
            checked={termsAccepted}
            onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
            className="mt-1"
          />
          <label className="text-sm text-[#a1a1a1]">
            I agree to the{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#39b54a] hover:underline"
            >
              User Terms of Use
            </a>
            {invite && (
              <>
                ,{" "}
                <a
                  href="/creator-terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#39b54a] hover:underline"
                >
                  Creator Terms of Use
                </a>
              </>
            )}
            {" "}and{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#39b54a] hover:underline"
            >
              Privacy Policy
            </a>
            <span className="text-red-500"> *</span>
          </label>
        </div>

        <Button
          type="submit"
          disabled={loading || inviteLoading || !termsAccepted}
          className="w-full bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold py-3"
        >
          {loading
            ? "Creating Account..."
            : inviteLoading
            ? "Verifying Invite..."
            : invite
            ? "Create Creator Account"
            : "Sign Up"}
        </Button>
      </form>

      {/* OAuth skips the whole email-confirmation round trip. Not offered for
          invite signups — those must be created under the invited email. */}
      {!invite && !betaInvite && (
        <GoogleAuthButton redirect={redirect} label="Sign up with Google" />
      )}

      <p className="text-center text-[#a1a1a1] text-sm mt-6">
        Already have an account?{" "}
        <Link
          href={loginHref}
          className="text-[#39b54a] hover:text-[#2e9140] font-medium"
        >
          Sign In
        </Link>
      </p>
    </div>
  );
}
