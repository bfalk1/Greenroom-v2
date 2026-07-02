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

    // Invites (CREATOR role, beta credits, paywall bypass) are only honored once
    // the email is verified — otherwise registering with another person's
    // invited address would inherit their entitlements. Mirrors the callback.
    const emailConfirmed = Boolean(authUser.email_confirmed_at);

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
      // Check by email (handles seeded accounts where Prisma ID might differ).
      // Case-insensitive so a legacy mixed-case row still matches the lowercased
      // auth email instead of falling through to a duplicate account below.
      user = await prisma.user.findFirst({
        where: { email: { equals: authUser.email, mode: "insensitive" } },
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
      let pendingInvite: { id: string } | null = null;

      if (authUser.email && emailConfirmed) {
        // Case-insensitive so a mixed-case invite row still matches the lowercased
        // auth email (see the lookup in the existing-user branch below).
        const invite = await prisma.creatorInvite.findFirst({
          where: { email: { equals: authUser.email, mode: "insensitive" } },
        });
        if (invite && !invite.usedAt && invite.expiresAt > new Date()) {
          role = "CREATOR";
          artistName = invite.artistName;
          pendingInvite = invite;
        }
      }

      // Create user FIRST (before updating invite to avoid FK violation)
      user = await prisma.user.create({
        data: {
          id: authUser.id,
          email: authUser.email || "",
          artistName,
          profileCompleted: false,
          role,
          isActive: true,
          termsAcceptedAt: new Date(),
        },
        include: {
          creditBalance: true,
          subscription: {
            include: { tier: true },
          },
        },
      });

      // Now mark invite as used (user exists, FK will succeed)
      if (pendingInvite) {
        await prisma.creatorInvite.update({
          where: { id: pendingInvite.id },
          data: { usedAt: new Date(), usedByUserId: user.id },
        });
      }

      // Check for beta invite
      let betaCredits = 0;
      if (authUser.email && emailConfirmed) {
        const betaInvite = await prisma.betaInvite.findFirst({
          where: { email: { equals: authUser.email, mode: "insensitive" } },
        });
        if (betaInvite && !betaInvite.usedAt && betaInvite.expiresAt > new Date()) {
          betaCredits = betaInvite.credits;

          // Mark beta invite as used
          await prisma.betaInvite.update({
            where: { id: betaInvite.id },
            data: { usedAt: new Date(), usedByUserId: user.id },
          });

          // Set subscription status to active (bypass paywall). Credits live
          // in creditBalance only — see the upsert below.
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionStatus: "active",
            },
            include: {
              creditBalance: true,
              subscription: { include: { tier: true } },
            },
          });
        }
      }

      // Upsert (not create) so a concurrent first-login retry doesn't fail
      // with a unique-constraint error and leave creditBalance.balance drifted
      // from user.credits.
      await prisma.creditBalance.upsert({
        where: { userId: authUser.id },
        create: { userId: authUser.id, balance: betaCredits },
        update: { balance: betaCredits },
      });

      // Log beta credits as a transaction
      if (betaCredits > 0) {
        await prisma.creditTransaction.create({
          data: {
            userId: authUser.id,
            amount: betaCredits,
            type: "ADMIN_ADJUSTMENT",
            note: "Beta invite credits",
          },
        });
      }

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
    } else if (user.role === "USER" && authUser.email && emailConfirmed) {
      // Existing user - check if they have a pending invite to upgrade.
      // Case-insensitive so a mixed-case invite row still matches the lowercased
      // auth email instead of silently leaving them a USER.
      const invite = await prisma.creatorInvite.findFirst({
        where: { email: { equals: authUser.email, mode: "insensitive" } },
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
          where: { id: invite.id },
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

      // Check for pending beta invite for existing users
      if (authUser.email && emailConfirmed) {
        const betaInvite = await prisma.betaInvite.findFirst({
          where: { email: { equals: authUser.email, mode: "insensitive" } },
        });
        if (betaInvite && !betaInvite.usedAt && betaInvite.expiresAt > new Date()) {
          // Credits live in creditBalance only — see the upsert below.
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionStatus: "active",
            },
            include: {
              creditBalance: true,
              subscription: { include: { tier: true } },
            },
          });

          await prisma.creditBalance.upsert({
            where: { userId: user.id },
            create: { userId: user.id, balance: betaInvite.credits },
            update: { balance: { increment: betaInvite.credits } },
          });

          await prisma.creditTransaction.create({
            data: {
              userId: user.id,
              amount: betaInvite.credits,
              type: "ADMIN_ADJUSTMENT",
              note: "Beta invite credits",
            },
          });

          await prisma.betaInvite.update({
            where: { id: betaInvite.id },
            data: { usedAt: new Date(), usedByUserId: user.id },
          });
        }
      }
    }

    // Reconcile our stored email with the verified auth email — e.g. after the
    // user confirmed an email change (see PATCH /api/user/email). Keyed by auth
    // id; guarded so a rare email collision can't break the whole request.
    if (authUser.email && user.email !== authUser.email) {
      try {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { email: authUser.email },
          include: {
            creditBalance: true,
            subscription: { include: { tier: true } },
          },
        });
      } catch (e) {
        console.error("Failed to reconcile user email:", e);
      }
    }

    const credits = user.creditBalance?.balance ?? 0;
    const subscriptionStatus = user.subscriptionStatus ?? "none";

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
        terms_accepted_at: user.termsAcceptedAt,
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
      terms_accepted_at,
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
    if (terms_accepted_at !== undefined) updateData.termsAcceptedAt = new Date(terms_accepted_at);

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
