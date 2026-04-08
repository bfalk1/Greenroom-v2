"use client";

import React, { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { trackSignup } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2 } from "lucide-react";

interface InviteData {
  email: string;
  artistName: string;
}

function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check for invite token on mount (optional - for creator invites)
  useEffect(() => {
    const inviteToken = searchParams.get("invite");
    
    // No invite token = public signup (allowed now)
    if (!inviteToken) {
      return;
    }
    
    setInviteLoading(true);
    fetch(`/api/invites/verify?token=${encodeURIComponent(inviteToken)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.valid && data.email) {
          setInvite({
            email: data.email,
            artistName: data.artistName || "Creator",
          });
          setEmail(data.email);
        } else if (data.error) {
          // Invalid invite - just ignore and allow public signup
          console.warn("Invalid invite token:", data.error);
        }
      })
      .catch((err) => {
        console.error("Failed to verify invite:", err);
      })
      .finally(() => {
        setInviteLoading(false);
      });
  }, [searchParams, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/callback`,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      // If session exists, email confirmation is off — redirect to pricing (paywall)
      if (data.session) {
        await fetch("/api/user/me");
        trackSignup(invite ? "invite" : "email");
        // Creator invites go to onboarding, regular signups go to pricing
        if (invite) {
          router.push("/onboarding");
        } else {
          router.push("/pricing?welcome=true");
        }
        return;
      }

      // Email confirmation is on — show check email screen
      trackSignup(invite ? "invite" : "email");
      setSuccess(true);
    } catch (err) {
      console.error("Signup error:", err);
      setError("Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="w-full max-w-md text-center">
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697bed99d794c79d63ec6b73/c33d47e0e_GREENROOMLOGOWHITE.png"
          alt="GREENROOM"
          className="h-6 mx-auto mb-6"
        />
        <h1 className="text-3xl font-bold text-white mb-4">Check Your Email</h1>
        <p className="text-[#a1a1a1] mb-6">
          We sent a confirmation link to <span className="text-white font-medium">{email}</span>. Click it to activate your account.
        </p>
        <Link href="/login">
          <Button className="bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold">
            Back to Sign In
          </Button>
        </Link>
      </div>
    );
  }

  return (
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
        <h1 className="text-3xl font-bold text-white mb-2">
          {invite ? "Join as a Creator" : "Create Your Account"}
        </h1>
        <p className="text-[#a1a1a1]">
          {invite
            ? "Complete your creator account setup"
            : "Join GREENROOM and start discovering samples"}
        </p>
      </div>

      {/* Creator Invite Banner */}
      {invite && (
        <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-[#39b54a]/10 to-[#2e9140]/10 border border-[#39b54a]/30">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-[#39b54a]" />
            <span className="font-semibold text-[#39b54a]">Creator Invite</span>
          </div>
          <p className="text-sm text-[#a1a1a1] mb-1">
            Welcome, <span className="text-white font-medium">{invite.artistName}</span>!
          </p>
          <p className="text-sm text-[#a1a1a1]">
            Signing up as <span className="text-white font-medium">{invite.email}</span>
          </p>
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
        {/* Hide email field if invite (email is pre-set) */}
        {!invite && (
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

        <Button
          type="submit"
          disabled={loading || inviteLoading}
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

      <p className="text-center text-[#a1a1a1] text-sm mt-6">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-[#39b54a] hover:text-[#2e9140] font-medium"
        >
          Sign In
        </Link>
      </p>
    </div>
  );
}

function SignupLoading() {
  return (
    <div className="w-full max-w-md flex flex-col items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin mb-4" />
      <p className="text-[#a1a1a1]">Loading...</p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center px-4">
      <Suspense fallback={<SignupLoading />}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
