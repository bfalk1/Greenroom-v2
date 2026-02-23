import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

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

    const { newEmail, currentPassword } = await request.json();

    if (!newEmail || !currentPassword) {
      return NextResponse.json(
        { error: "New email and current password are required" },
        { status: 400 }
      );
    }

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

    // Create admin client for email update
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

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

    // Update email in Supabase Auth using admin client
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      authUser.id,
      { email: newEmail, email_confirm: true }
    );

    if (updateError) {
      console.error("Email update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update email" },
        { status: 500 }
      );
    }

    // Update email in our database too
    await prisma.user.update({
      where: { id: authUser.id },
      data: { email: newEmail },
    });

    return NextResponse.json({ 
      success: true, 
      message: "Email updated successfully" 
    });
  } catch (error) {
    console.error("PATCH /api/user/email error:", error);
    return NextResponse.json(
      { error: "Failed to update email" },
      { status: 500 }
    );
  }
}
