import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find user in our DB (by ID first, then by email for seeded accounts)
    let user = await prisma.user.findUnique({
      where: { id: authUser.id },
      include: {
        creditBalance: true,
        subscription: {
          include: { tier: true },
        },
      },
    });

    if (!user && authUser.email) {
      // Check by email (handles seeded accounts where Prisma ID might differ)
      user = await prisma.user.findUnique({
        where: { email: authUser.email },
        include: {
          creditBalance: true,
          subscription: {
            include: { tier: true },
          },
        },
      });
    }

    if (!user) {
      // First time login — create user record
      // Check for pending invite first
      let role: "USER" | "CREATOR" = "USER";
      let artistName: string | undefined;
      
      if (authUser.email) {
        const invite = await prisma.creatorInvite.findUnique({
          where: { email: authUser.email },
        });
        if (invite && !invite.usedAt && invite.expiresAt > new Date()) {
          role = "CREATOR";
          artistName = invite.artistName;
          // Mark invite as used
          await prisma.creatorInvite.update({
            where: { email: authUser.email },
            data: { usedAt: new Date(), usedByUserId: authUser.id },
          });
        }
      }

      user = await prisma.user.create({
        data: {
          id: authUser.id,
          email: authUser.email || "",
          artistName,
          profileCompleted: false,
          role,
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

      // Create approved application for invited creators
      if (role === "CREATOR") {
        await prisma.creatorApplication.create({
          data: {
            userId: authUser.id,
            artistName: artistName || "Invited Creator",
            sampleZipUrl: "",
            status: "APPROVED",
            reviewNote: "Auto-approved via admin invite",
            reviewedAt: new Date(),
          },
        });
      }
    } else if (user.role === "USER" && authUser.email) {
      // Existing user - check if they have a pending invite to upgrade
      const invite = await prisma.creatorInvite.findUnique({
        where: { email: authUser.email },
      });
      
      if (invite && !invite.usedAt && invite.expiresAt > new Date()) {
        // Upgrade to CREATOR
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            role: "CREATOR",
            artistName: user.artistName || invite.artistName,
          },
          include: {
            creditBalance: true,
            subscription: {
              include: { tier: true },
            },
          },
        });

        // Mark invite as used
        await prisma.creatorInvite.update({
          where: { email: authUser.email },
          data: { usedAt: new Date(), usedByUserId: user.id },
        });

        // Create approved application if doesn't exist
        const existingApp = await prisma.creatorApplication.findUnique({
          where: { userId: user.id },
        });
        if (!existingApp) {
          await prisma.creatorApplication.create({
            data: {
              userId: user.id,
              artistName: invite.artistName || "Invited Creator",
              sampleZipUrl: "",
              status: "APPROVED",
              reviewNote: "Auto-approved via admin invite",
              reviewedAt: new Date(),
            },
          });
        }
      }
    }

    const credits = user.creditBalance?.balance ?? user.credits ?? 0;
    const subscription = user.subscription;
    const subscriptionStatus =
      subscription?.status?.toLowerCase() ??
      user.subscriptionStatus ??
      "none";

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        credits,
        subscription_status: subscriptionStatus,
        is_creator: user.role === "CREATOR" || user.role === "ADMIN",
        role: user.role,
        full_name: user.fullName,
        username: user.username,
        artist_name: user.artistName,
        avatar_url: user.avatarUrl,
        profile_completed: user.profileCompleted,
        social_links: user.socialLinks,
        bio: user.bio,
        banner_url: user.bannerUrl,
        is_whitelisted: user.isWhitelisted ?? false,
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

// PATCH /api/user/me - Update user profile
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      full_name,
      username,
      bio,
      social_links,
      avatar_url,
      banner_url,
    } = body;

    // Validate username if provided
    if (username) {
      // Check for valid characters
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return NextResponse.json(
          { error: "Username can only contain letters, numbers, and underscores" },
          { status: 400 }
        );
      }

      if (username.length < 3 || username.length > 30) {
        return NextResponse.json(
          { error: "Username must be between 3 and 30 characters" },
          { status: 400 }
        );
      }

      // Check uniqueness
      const existing = await prisma.user.findFirst({
        where: {
          username: { equals: username, mode: "insensitive" },
          id: { not: authUser.id },
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: "Username is already taken" },
          { status: 400 }
        );
      }
    }

    // Validate social links structure if provided
    if (social_links) {
      const validKeys = [
        "instagram",
        "tiktok",
        "twitter",
        "x",
        "spotify",
        "soundcloud",
        "apple_music",
        "youtube",
        "website",
      ];
      
      for (const key of Object.keys(social_links)) {
        if (!validKeys.includes(key)) {
          return NextResponse.json(
            { error: `Invalid social link type: ${key}` },
            { status: 400 }
          );
        }
        
        // Validate URL format if value is provided
        const value = social_links[key];
        if (value && typeof value === "string" && value.trim()) {
          try {
            new URL(value);
          } catch {
            return NextResponse.json(
              { error: `Invalid URL for ${key}` },
              { status: 400 }
            );
          }
        }
      }
    }

    const updateData: Record<string, unknown> = {};
    
    if (full_name !== undefined) updateData.fullName = full_name;
    if (username !== undefined) updateData.username = username;
    if (bio !== undefined) updateData.bio = bio;
    if (social_links !== undefined) updateData.socialLinks = social_links;
    if (avatar_url !== undefined) updateData.avatarUrl = avatar_url;
    if (banner_url !== undefined) updateData.bannerUrl = banner_url;

    const user = await prisma.user.update({
      where: { id: authUser.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        full_name: user.fullName,
        username: user.username,
        bio: user.bio,
        social_links: user.socialLinks,
        avatar_url: user.avatarUrl,
        banner_url: user.bannerUrl,
      },
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
