import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/email";

// PATCH /api/user/email — Change email with password verification
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { newEmail: rawNewEmail, currentPassword } = await request.json();

    if (!rawNewEmail || typeof rawNewEmail !== "string" || !currentPassword) {
      return NextResponse.json(
        { error: "New email and current password are required" },
        { status: 400 }
      );
    }

    // Normalize to match how Supabase stores it (lowercased). Without this the
    // duplicate-email guard below is a case-sensitive compare and can be bypassed
    // with a case variant, and the value handed to Supabase would differ from the
    // address we later reconcile from auth.
    const newEmail = normalizeEmail(rawNewEmail);

    // Verify password using Supabase Auth REST API
    const verifyRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY!,
        },
        body: JSON.stringify({
          email: authUser.email,
          password: currentPassword,
        }),
      }
    );

    if (!verifyRes.ok) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 401 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Check if email is already taken
    const existingUser = await prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (existingUser && existingUser.id !== authUser.id) {
      return NextResponse.json(
        { error: "Email is already in use" },
        { status: 409 }
      );
    }

    // Use the user-scoped session client so Supabase emails a confirmation link
    // to the NEW address; the change only takes effect once the user clicks it.
    // We do NOT auto-confirm or pre-update auth/our DB — ownership of the new
    // mailbox must be proven first (prevents verified-email squatting). Our DB
    // email is reconciled from the auth email on the next /api/user/me load.
    const { error: updateError } = await supabase.auth.updateUser({
      email: newEmail,
    });

    if (updateError) {
      console.error("Email update error:", updateError);
      return NextResponse.json(
        { error: "Failed to start email change" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Check your new email for a confirmation link to complete the change.",
    });
  } catch (error) {
    console.error("PATCH /api/user/email error:", error);
    return NextResponse.json(
      { error: "Failed to update email" },
      { status: 500 }
    );
  }
}
