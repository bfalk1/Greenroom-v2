import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET - Verify an invite token (public endpoint for signup page)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  console.log("[Invite Verify] Request received, token:", token);

  if (!token) {
    console.log("[Invite Verify] No token provided");
    return NextResponse.json({ valid: false, error: "Token required" }, { status: 400 });
  }

  try {
    // First try by token field
    console.log("[Invite Verify] Looking up by token...");
    let invite = await prisma.creatorInvite.findUnique({
      where: { token },
    });

    // Fallback: maybe it's the ID
    if (!invite) {
      console.log("[Invite Verify] Token not found, trying as ID...");
      invite = await prisma.creatorInvite.findUnique({
        where: { id: token },
      });
    }

    if (!invite) {
      console.log("[Invite Verify] Invite not found by token or ID");
      return NextResponse.json({ valid: false, error: "Invite not found" });
    }

    console.log("[Invite Verify] Found invite:", { 
      id: invite.id, 
      email: invite.email, 
      usedAt: invite.usedAt, 
      expiresAt: invite.expiresAt 
    });

    if (invite.usedAt) {
      console.log("[Invite Verify] Invite already used");
      return NextResponse.json({ valid: false, error: "Invite already used" });
    }

    if (invite.expiresAt < new Date()) {
      console.log("[Invite Verify] Invite expired");
      return NextResponse.json({ valid: false, error: "Invite expired" });
    }

    console.log("[Invite Verify] Invite valid!");
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
