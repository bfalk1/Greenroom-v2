import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";
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

// GET — report whether this browser has already unlocked the offer. Lets the page
// stay unlocked across reloads / a login round-trip without re-entering the code.
export async function GET() {
  const store = await cookies();
  const unlocked = verifyVipUnlock(store.get(VIP_OFFER_COOKIE)?.value);
  return NextResponse.json({ unlocked });
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
