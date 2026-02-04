import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find or create user in our DB
    let user = await prisma.user.findUnique({
      where: { id: authUser.id },
      include: {
        creditBalance: true,
        subscription: {
          include: { tier: true },
        },
      },
    });

    if (!user) {
      // First time login — create user record
      user = await prisma.user.create({
        data: {
          id: authUser.id,
          email: authUser.email || "",
          profileCompleted: false,
          role: "USER",
          isActive: true,
        },
        include: {
          creditBalance: true,
          subscription: {
            include: { tier: true },
          },
        },
      });

      // Create credit balance
      await prisma.creditBalance.create({
        data: {
          userId: authUser.id,
          balance: 0,
        },
      });
    }

    const credits = user.creditBalance?.balance ?? 0;
    const subscription = user.subscription;
    const subscriptionStatus = subscription?.status?.toLowerCase() ?? "none";

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        credits,
        subscription_status: subscriptionStatus,
        is_creator: user.role === "CREATOR",
        role: user.role,
        full_name: user.fullName,
        username: user.username,
        artist_name: user.artistName,
        avatar_url: user.avatarUrl,
        profile_completed: user.profileCompleted,
      },
    });
  } catch (error) {
    console.error("Error in /api/user/me:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
