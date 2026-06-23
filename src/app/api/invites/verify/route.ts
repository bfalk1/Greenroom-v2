import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";

// GET - Verify an invite token (public endpoint for signup page)
export async function GET(request: NextRequest) {
  // Public token lookup — cap per IP to deter enumeration/brute force.
  const rl = await rateLimit(`invite-verify:${clientIp(request)}`, {
    limit: 10,
    windowSec: 60,
  });
  if (!rl.success) return tooManyRequests();

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ valid: false, error: "Token required" }, { status: 400 });
  }

  try {
    // Look up strictly by the secret token — never fall back to the row id
    // (an id is not a secret and would weaken the invite to an enumerable value).
    const invite = await prisma.creatorInvite.findUnique({
      where: { token },
    });

    if (!invite) {
      return NextResponse.json({ valid: false, error: "Invite not found" });
    }

    if (invite.usedAt) {
      return NextResponse.json({ valid: false, error: "Invite already used" });
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ valid: false, error: "Invite expired" });
    }

    return NextResponse.json({
      valid: true,
      email: invite.email,
      artistName: invite.artistName,
    });
  } catch (error) {
    console.error("[Invite Verify] Error:", error);
    return NextResponse.json({ valid: false, error: "Server error" }, { status: 500 });
  }
}
