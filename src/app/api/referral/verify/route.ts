import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeReferralCode, REFERRED_SIGNUP_CREDITS } from "@/lib/referralCode";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";

// GET /api/referral/verify?code=XXXXXXXX — public (listed in middleware's
// public API paths), used by the signup page to show the referral banner.
// Returns only a display name — never the referrer's email or id.
export async function GET(request: NextRequest) {
  try {
    const rl = await rateLimit(`referral-verify:${clientIp(request)}`, {
      limit: 20,
      windowSec: 60,
    });
    if (!rl.success) return tooManyRequests();

    const code = normalizeReferralCode(
      request.nextUrl.searchParams.get("code")
    );
    if (!code) {
      return NextResponse.json({ valid: false });
    }

    const referrer = await prisma.user.findUnique({
      where: { referralCode: code },
      select: {
        role: true,
        artistName: true,
        username: true,
        isActive: true,
        isFlagged: true,
      },
    });

    if (!referrer || !referrer.isActive || referrer.isFlagged) {
      return NextResponse.json({ valid: false });
    }

    // The referred user's reward depends on who referred them: a creator's link
    // grants the VIP lifetime discount; anyone else's grants signup credits.
    const isCreator = referrer.role === "CREATOR";

    return NextResponse.json({
      valid: true,
      referrerName:
        referrer.artistName || referrer.username || "A GREENROOM member",
      reward: isCreator ? "vip" : "credits",
      credits: isCreator ? 0 : REFERRED_SIGNUP_CREDITS,
    });
  } catch (error) {
    console.error("GET /api/referral/verify error:", error);
    return NextResponse.json(
      { error: "Failed to verify referral code" },
      { status: 500 }
    );
  }
}
