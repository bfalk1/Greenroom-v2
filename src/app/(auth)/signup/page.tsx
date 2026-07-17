"use client";

import React, { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles, Gift, Loader2 } from "lucide-react";
import { safeRedirectPath } from "@/lib/safeRedirect";
import {
  SignupForm,
  type InviteData,
  type BetaInviteData,
} from "@/components/auth/SignupForm";

interface ReferralData {
  referrerName: string;
  reward: "vip" | "credits";
  credits: number;
}

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [betaInvite, setBetaInvite] = useState<BetaInviteData | null>(null);
  const [referral, setReferral] = useState<ReferralData | null>(null);
  // Starts true when an invite token is present — verification kicks off on
  // mount, and the submit button must not read "Sign Up" before it resolves.
  const [inviteLoading, setInviteLoading] = useState(() =>
    Boolean(searchParams.get("invite") || searchParams.get("beta"))
  );
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Optional post-signup destination (e.g. the /vip lifetime flow sends
  // ?redirect=/checkout?tier=VIP&lifetime=1). Same-origin relative paths only,
  // validated centrally.
  const safeRedirect = safeRedirectPath(searchParams.get("redirect"));

  // Referral code from a shared link (/signup?ref=CODE). Verified below only to
  // show the banner — an invalid code degrades to a normal signup rather than a
  // dead end (a referral is a bonus, not a gate). Redemption itself is driven
  // server-side from the raw ?ref param / user_metadata, not this state.
  const referralCode = searchParams.get("ref");

  // Check for invite token on mount (creator or beta invites)
  useEffect(() => {
    const inviteToken = searchParams.get("invite");
    const betaToken = searchParams.get("beta");

    if (betaToken) {
      fetch(`/api/beta-invites/verify?token=${encodeURIComponent(betaToken)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.valid && data.email) {
            setBetaInvite({ email: data.email, credits: data.credits });
          } else {
            setInviteError(data.error || "This beta invite link is invalid or expired.");
          }
        })
        .catch((err) => {
          console.error("Failed to verify beta invite:", err);
          setInviteError("Couldn't verify your beta invite. Please try again.");
        })
        .finally(() => {
          setInviteLoading(false);
        });
      return;
    }

    if (!inviteToken) return;

    fetch(`/api/invites/verify?token=${encodeURIComponent(inviteToken)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.valid && data.email) {
          setInvite({
            email: data.email,
            artistName: data.artistName || "Creator",
          });
        } else {
          setInviteError(data.error || "This invite link is invalid or expired.");
        }
      })
      .catch((err) => {
        console.error("Failed to verify invite:", err);
        setInviteError("Couldn't verify your invite. Please try again.");
      })
      .finally(() => {
        setInviteLoading(false);
      });
  }, [searchParams, router]);

  // Verify the referral code so the banner can name the referrer + reward. The
  // banner is hidden when an invite is also present (invites carry their own).
  useEffect(() => {
    if (!referralCode) return;
    fetch(`/api/referral/verify?code=${encodeURIComponent(referralCode)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) {
          setReferral({
            referrerName: data.referrerName,
            reward: data.reward === "vip" ? "vip" : "credits",
            credits: data.credits,
          });
        }
      })
      .catch((err) => {
        console.error("Failed to verify referral code:", err);
      });
  }, [referralCode]);

  // Where to land after signup. A creator-referred user is sent to the VIP
  // offer their account now unlocks (unless an explicit redirect was set) — the
  // referral itself is redeemed server-side from ?ref / user_metadata.
  const postSignupRedirect =
    safeRedirect ?? (referral?.reward === "vip" ? "/vip" : null);

  // Attributes the signup to a funnel — "vip" when the carried redirect points
  // back into the lifetime-offer checkout, "referral" for a referral link.
  const signupSource =
    safeRedirect && /lifetime=1|\/vip/.test(safeRedirect)
      ? "vip"
      : referralCode && !invite && !betaInvite
        ? "referral"
        : undefined;

  const handleSession = () => {
    if (invite || betaInvite) {
      // Onboarding honors ?redirect after submit, so a carried destination
      // survives the profile step instead of being discarded here.
      router.push(
        postSignupRedirect
          ? `/onboarding?redirect=${encodeURIComponent(postSignupRedirect)}`
          : "/onboarding"
      );
    } else {
      router.push(postSignupRedirect ?? "/pricing?welcome=true");
    }
  };

  if (inviteError) {
    return (
      <div className="w-full max-w-md text-center">
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697bed99d794c79d63ec6b73/c33d47e0e_GREENROOMLOGOWHITE.png"
          alt="GREENROOM"
          className="h-6 mx-auto mb-6"
        />
        <h1 className="text-3xl font-bold text-white mb-4">Invite Link Issue</h1>
        <p className="text-[#a1a1a1] mb-6">{inviteError}</p>
        <p className="text-[#a1a1a1] text-sm mb-6">
          If you believe this is a mistake, please contact the person who invited you for a fresh link.
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
    <SignupForm
      redirect={postSignupRedirect}
      source={signupSource}
      invite={invite}
      betaInvite={betaInvite}
      referralCode={referralCode}
      inviteLoading={inviteLoading}
      onSession={handleSession}
      screenLogo
      header={
        <>
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

          {/* Referral Banner (never shown alongside an invite banner) */}
          {referral && !invite && !betaInvite && (
            <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-[#39b54a]/10 to-[#2e9140]/10 border border-[#39b54a]/30">
              <div className="flex items-center gap-2 mb-2">
                <Gift className="w-5 h-5 text-[#39b54a]" />
                <span className="font-semibold text-[#39b54a]">
                  You&apos;ve Been Invited
                </span>
              </div>
              <p className="text-sm text-[#a1a1a1]">
                <span className="text-white font-medium">{referral.referrerName}</span>{" "}
                invited you to GREENROOM.{" "}
                {referral.reward === "vip" ? (
                  <>
                    Sign up to unlock the{" "}
                    <span className="text-white font-medium">
                      VIP lifetime discount
                    </span>
                    .
                  </>
                ) : (
                  <>
                    Subscribe to VIP and you&apos;ll both get{" "}
                    <span className="text-white font-medium">
                      {referral.credits} free credits
                    </span>
                    .
                  </>
                )}
              </p>
            </div>
          )}
        </>
      }
    />
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
        <SignupPageContent />
      </Suspense>
    </div>
  );
}
