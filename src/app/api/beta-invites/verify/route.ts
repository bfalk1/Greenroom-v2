import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ valid: false, error: "Token required" }, { status: 400 });
  }

  try {
    let invite = await prisma.betaInvite.findUnique({ where: { token } });

    if (!invite) {
      invite = await prisma.betaInvite.findUnique({ where: { id: token } });
    }

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
