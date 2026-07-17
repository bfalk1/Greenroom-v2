import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import {
  VIP_OFFER_COOKIE,
  VIP_OFFER_COOKIE_MAX_AGE,
  vipOfferPassword,
  signVipUnlock,
  verifyVipUnlock,
} from "@/lib/vipOffer";

// Password gate for the returning-subscriber /vip offer page.
//
// This is a soft marketing gate (a shared password handed to past subscribers),
// NOT account auth — but it IS the server-side check the checkout route relies on
// before applying the lifetime VIP coupon. The password is compared here on the
// server (never shipped to the client), and a successful match drops an httpOnly,
// HMAC-signed cookie that the checkout route reads to authorize the discount.

// GET — report whether the offer is unlocked for this visitor. Unlocked when
// EITHER this browser cleared the password gate (the httpOnly cookie, which
// survives reloads / a login round-trip) OR the signed-in account was granted
// the VIP offer via a creator referral (a permanent per-account entitlement).
export async function GET() {
  const store = await cookies();
  if (verifyVipUnlock(store.get(VIP_OFFER_COOKIE)?.value)) {
    return NextResponse.json({ unlocked: true });
  }

  // Only pay for the account lookup when the cookie didn't already unlock.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { vipOfferUnlockedAt: true },
    });
    if (dbUser?.vipOfferUnlockedAt != null) {
      return NextResponse.json({ unlocked: true });
    }
  }

  return NextResponse.json({ unlocked: false });
}

// POST — verify the password and, on success, set the unlock cookie.
export async function POST(request: Request) {
  // Unauthenticated, side-effecting check against a short shared secret — cap
  // per IP to deter brute force (same pattern as the invite-verify endpoints).
  const rl = await rateLimit(`vip-offer:${clientIp(request)}`, {
    limit: 10,
    windowSec: 60,
  });
  if (!rl.success) return tooManyRequests();

  let password = "";
  try {
    const body = await request.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Case-insensitive match: past subscribers may type the shared code in any
  // casing (grvip / GRVIP / GrViP), so compare with case folded on both sides.
  if (password.trim().toLowerCase() !== vipOfferPassword().toLowerCase()) {
    return NextResponse.json(
      { ok: false, error: "Incorrect password" },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(VIP_OFFER_COOKIE, signVipUnlock(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VIP_OFFER_COOKIE_MAX_AGE,
  });
  return res;
}
