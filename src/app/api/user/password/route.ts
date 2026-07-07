import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCurrentPassword } from "@/lib/verifyPassword";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";

// PATCH /api/user/password — Change password with current-password verification
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser || !authUser.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // verifyCurrentPassword below is a password-grant check — rate limit it so
    // an authenticated attacker can't brute-force the current password.
    const limit = await rateLimit(`password-change:${authUser.id}`, {
      limit: 5,
      windowSec: 60,
    });
    if (!limit.success) {
      return tooManyRequests();
    }

    const { currentPassword, newPassword } = await request.json();

    if (
      !currentPassword ||
      typeof currentPassword !== "string" ||
      !newPassword ||
      typeof newPassword !== "string"
    ) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 }
      );
    }

    // Mirror the signup rules; the upper bound is bcrypt's 72-byte input limit.
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }
    if (newPassword.length > 72) {
      return NextResponse.json(
        { error: "Password must be at most 72 characters" },
        { status: 400 }
      );
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: "New password must be different from your current password" },
        { status: 400 }
      );
    }

    const verified = await verifyCurrentPassword(authUser.email, currentPassword);
    if (!verified) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    // Update via the user-scoped session client; the current session stays valid.
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      console.error("Password update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update password" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error) {
    console.error("PATCH /api/user/password error:", error);
    return NextResponse.json(
      { error: "Failed to update password" },
      { status: 500 }
    );
  }
}
