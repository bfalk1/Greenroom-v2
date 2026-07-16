"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Gift, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackReferralLinkCopied } from "@/lib/analytics";

interface ReferralInfo {
  code: string;
  isCreator: boolean;
  terms: {
    referredReward: "vip" | "credits";
    referredCredits: number;
    referrerCredits: number;
    cashPerReferralCents: number;
  };
  stats: {
    totalReferrals: number;
    convertedReferrals: number;
    creditsEarned: number;
    cashCentsEarned: number;
    rewardedThisMonth: number;
    monthlyRewardCap: number;
  };
}

/**
 * "Invite friends" card, shared by the account page (variant="account",
 * credits reward) and the creator earnings page (variant="creator", payout
 * cash reward). Reward copy comes from the API so the panel always matches
 * what redemption will actually grant.
 */
export function ReferralPanel({
  variant,
}: {
  variant: "account" | "creator";
}) {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/referral")
      .then((res) => res.json())
      .then((data) => {
        if (data.code) setInfo(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const referralUrl = info
    ? `${window.location.origin}/signup?ref=${encodeURIComponent(info.code)}`
    : "";

  const context = variant === "creator" ? "creator_earnings" : "account";

  // A ready-to-send blurb the user can paste to friends — the referral
  // explanation with the link baked in, matching what redemption actually
  // grants (reward on VIP subscription).
  const shareMessage = info
    ? info.isCreator
      ? `Join me on GREENROOM and unlock the VIP lifetime discount — the best deal on royalty-free samples & presets. Sign up with my link: ${referralUrl}`
      : `Join me on GREENROOM! Subscribe to VIP with my link and we'll each get ${info.terms.referrerCredits} free credits. Sign up here: ${referralUrl}`
    : "";

  const copyMessage = () => {
    if (!shareMessage) return;
    navigator.clipboard.writeText(shareMessage);
    toast.success("Share message copied — paste it to a friend!");
    trackReferralLinkCopied(context);
  };

  const copyLink = () => {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl);
    toast.success("Referral link copied!");
    trackReferralLinkCopied(context);
  };

  const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  // Creator earnings page cards are p-6; account page cards are p-8.
  const padding = variant === "creator" ? "p-6" : "p-8";

  return (
    <div className={`bg-[#1a1a1a] rounded-lg ${padding} border border-[#2a2a2a] mb-8`}>
      <div className="flex items-center gap-2 mb-6">
        <Gift className="w-5 h-5 text-[#39b54a]" />
        <h2 className="text-lg font-semibold text-white">Invite Friends</h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[#a1a1a1] text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading your referral link...
        </div>
      ) : !info ? (
        <p className="text-[#a1a1a1] text-sm">
          Couldn&apos;t load your referral link. Please try again later.
        </p>
      ) : (
        <>
          <p className="text-[#a1a1a1] text-sm mb-4">
            {info.isCreator ? (
              <>
                Anyone who joins with your link unlocks the{" "}
                <span className="text-white font-medium">
                  VIP lifetime discount
                </span>{" "}
                — and you earn{" "}
                <span className="text-white font-medium">
                  {usd(info.terms.cashPerReferralCents)}
                </span>{" "}
                in creator earnings each time one of them subscribes to VIP.
              </>
            ) : (
              <>
                When a friend joins with your link and subscribes to VIP,{" "}
                <span className="text-white font-medium">
                  you both get {info.terms.referrerCredits} credits
                </span>
                .
              </>
            )}
          </p>

          {/* Ready-to-share message (explanation + link) */}
          <label className="block text-sm font-medium text-white mb-2">
            Share this with friends
          </label>
          <textarea
            readOnly
            value={shareMessage}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg bg-[#0a0a0a] border border-[#2a2a2a] px-4 py-3 text-sm text-[#a1a1a1] resize-none focus:outline-none focus:border-[#39b54a]/50 mb-3"
          />
          <Button
            onClick={copyMessage}
            className="w-full sm:w-auto bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold mb-6"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy Message
          </Button>

          {/* Or just the raw link */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="flex-1 rounded-lg bg-[#0a0a0a] border border-[#2a2a2a] px-4 py-3 text-sm text-[#a1a1a1] break-all">
              {referralUrl}
            </div>
            <Button
              onClick={copyLink}
              variant="outline"
              className="border-[#2a2a2a] text-white hover:bg-[#2a2a2a] shrink-0"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Link
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-[#0a0a0a] border border-[#2a2a2a] p-4">
              <p className="text-[#a1a1a1] text-xs mb-1">Joined</p>
              <p className="text-xl font-bold text-white">
                {info.stats.totalReferrals}
              </p>
            </div>
            <div className="rounded-lg bg-[#0a0a0a] border border-[#2a2a2a] p-4">
              <p className="text-[#a1a1a1] text-xs mb-1">Subscribed</p>
              <p className="text-xl font-bold text-white">
                {info.stats.convertedReferrals}
              </p>
            </div>
            <div className="rounded-lg bg-[#0a0a0a] border border-[#2a2a2a] p-4">
              <p className="text-[#a1a1a1] text-xs mb-1">
                {info.isCreator ? "Earned" : "Credits"}
              </p>
              <p className="text-xl font-bold text-white">
                {info.isCreator
                  ? usd(info.stats.cashCentsEarned)
                  : info.stats.creditsEarned}
              </p>
            </div>
          </div>

          {info.stats.rewardedThisMonth >= info.stats.monthlyRewardCap && (
            <p className="text-[#666] text-xs mt-4">
              You&apos;ve hit this month&apos;s referral reward limit (
              {info.stats.monthlyRewardCap}). It resets next month.
            </p>
          )}
        </>
      )}
    </div>
  );
}
