import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { username, full_name, city, country } = body;

    // Validate required fields
    if (!username || !full_name) {
      return NextResponse.json(
        { error: "Username and full name are required" },
        { status: 400 }
      );
    }

    // Validate username format
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return NextResponse.json(
        { error: "Username must be 3-30 characters, lowercase letters, numbers, and underscores only" },
        { status: 400 }
      );
    }

    // Check username uniqueness
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser && existingUser.id !== authUser.id) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 409 }
      );
    }

    // Update user profile
    const user = await prisma.user.update({
      where: { id: authUser.id },
      data: {
        username,
        fullName: full_name,
        city: city || null,
        country: country || null,
        profileCompleted: true,
      },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        full_name: user.fullName,
        profile_completed: user.profileCompleted,
      },
    });
  } catch (error) {
    console.error("Error in /api/user/profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
