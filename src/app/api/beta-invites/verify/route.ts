import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";

export async function GET(request: NextRequest) {
  // Public token lookup — cap per IP to deter enumeration/brute force.
  const rl = await rateLimit(`beta-invite-verify:${clientIp(request)}`, {
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
    // Look up strictly by the secret token — never by row id (not a secret).
    const invite = await prisma.betaInvite.findUnique({ where: { token } });

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
      credits: invite.credits,
    });
  } catch (error) {
    console.error("[Beta Invite Verify] Error:", error);
    return NextResponse.json({ valid: false, error: "Server error" }, { status: 500 });
  }
}
