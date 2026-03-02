import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET - Verify an invite token (public endpoint for signup page)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ valid: false, error: "Token required" }, { status: 400 });
  }

  try {
    const invite = await prisma.creatorInvite.findUnique({
      where: { token },
    });

    if (!invite) {
      return NextResponse.json({ valid: false, error: "Invalid invite" });
    }

    if (invite.usedAt) {
      return NextResponse.json({ valid: false, error: "Invite already used" });
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ valid: false, error: "Invite expired" });
    }

    // Return invite details (only email and artist name, nothing sensitive)
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
