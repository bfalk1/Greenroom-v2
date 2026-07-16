import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateReferralCode, getReferralStats } from "@/lib/referral";
import {
  REFERRED_SIGNUP_CREDITS,
  REFERRER_REWARD_CREDITS,
  CREATOR_REFERRER_REWARD_CENTS,
} from "@/lib/referralCode";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";

// GET /api/referral — the authenticated user's referral code (allocated on
// first call), reward terms, and lifetime stats for the referral panel.
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // First call writes the allocated code; keep a light lid on it.
    const rl = await rateLimit(`referral:${authUser.id}`, {
      limit: 30,
      windowSec: 60,
    });
    if (!rl.success) return tooManyRequests();

    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isCreator = dbUser.role === "CREATOR";

    const [code, stats] = await Promise.all([
      getOrCreateReferralCode(authUser.id),
      getReferralStats(authUser.id),
    ]);

    return NextResponse.json({
      code,
      isCreator,
      terms: {
        // Creator link: referred user gets the VIP discount (not credits), and
        // the creator earns a flat $10 payout cash per signup. Everyone else:
        // 100 credits to both sides.
        referredReward: isCreator ? "vip" : "credits",
        referredCredits: isCreator ? 0 : REFERRED_SIGNUP_CREDITS,
        referrerCredits: isCreator ? 0 : REFERRER_REWARD_CREDITS,
        cashPerReferralCents: isCreator ? CREATOR_REFERRER_REWARD_CENTS : 0,
      },
      stats,
    });
  } catch (error) {
    console.error("GET /api/referral error:", error);
    return NextResponse.json(
      { error: "Failed to load referral info" },
      { status: 500 }
    );
  }
}
