import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Check if user exists in our DB (by ID first, then by email for seeded accounts)
      let user = await prisma.user.findUnique({
        where: { id: data.user.id },
      });

      if (!user && data.user.email) {
        // Check by email (handles seeded accounts where Prisma ID might differ from auth ID)
        user = await prisma.user.findUnique({
          where: { email: data.user.email },
        });
      }

      let isNewUser = false;
      let hasCreatorInvite = false;
      let hasBetaInvite = false;
      let betaCredits = 0;
      let inviteArtistName: string | null = null;

      // Check for a valid creator invite (for both new and existing users)
      if (data.user.email) {
        const invite = await prisma.creatorInvite.findUnique({
          where: { email: data.user.email },
        });

        if (invite && !invite.usedAt && invite.expiresAt > new Date()) {
          hasCreatorInvite = true;
          inviteArtistName = invite.artistName;
        }

        // Check for beta invite
        const betaInvite = await prisma.betaInvite.findUnique({
          where: { email: data.user.email },
        });

        if (betaInvite && !betaInvite.usedAt && betaInvite.expiresAt > new Date()) {
          hasBetaInvite = true;
          betaCredits = betaInvite.credits;
        }
      }

      if (!user) {
        isNewUser = true;

        // Create user record - set as CREATOR if they have a valid invite
        user = await prisma.user.create({
          data: {
            id: data.user.id,
            email: data.user.email || "",
            artistName: hasCreatorInvite ? inviteArtistName : undefined,
            profileCompleted: false,
            role: hasCreatorInvite ? "CREATOR" : "USER",
            isActive: true,
            termsAcceptedAt: new Date(),
          },
        });

        // Create credit balance
        await prisma.creditBalance.create({
          data: {
            userId: data.user.id,
            balance: hasBetaInvite ? betaCredits : 0,
          },
        });

        // Apply beta invite: credits + subscription bypass
        if (hasBetaInvite && data.user.email) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionStatus: "active",
              credits: betaCredits,
            },
          });

          await prisma.creditTransaction.create({
            data: {
              userId: user.id,
              amount: betaCredits,
              type: "ADMIN_ADJUSTMENT",
              note: "Beta invite credits",
            },
          });

          await prisma.betaInvite.update({
            where: { email: data.user.email },
            data: { usedAt: new Date(), usedByUserId: user.id },
          });
        }
      } else if (hasCreatorInvite && user.role === "USER") {
        // Existing user with pending invite - upgrade to CREATOR
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            role: "CREATOR",
            artistName: user.artistName || inviteArtistName,
          },
        });
      }

      // If they had an invite, mark it as used and create a pre-approved application
      if (hasCreatorInvite && data.user.email) {
        await prisma.creatorInvite.update({
          where: { email: data.user.email },
          data: {
            usedAt: new Date(),
            usedByUserId: user.id,
          },
        });

        // Check if they already have a creator application
        const existingApp = await prisma.creatorApplication.findUnique({
          where: { userId: user.id },
        });

        if (!existingApp) {
          // Create an approved CreatorApplication record for consistency
          await prisma.creatorApplication.create({
            data: {
              userId: user.id,
              artistName: inviteArtistName || "Invited Creator",
              sampleZipUrl: "", // Not required for invites
              status: "APPROVED",
              reviewNote: "Auto-approved via admin invite",
              reviewedAt: new Date(),
              termsAcceptedAt: new Date(),
            },
          });
        }
      }

      // Handle beta invite for existing users
      if (hasBetaInvite && !isNewUser && data.user.email) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionStatus: "active",
            credits: { increment: betaCredits },
          },
        });

        const existingBalance = await prisma.creditBalance.findUnique({
          where: { userId: user.id },
        });
        if (existingBalance) {
          await prisma.creditBalance.update({
            where: { userId: user.id },
            data: { balance: { increment: betaCredits } },
          });
        }

        await prisma.creditTransaction.create({
          data: {
            userId: user.id,
            amount: betaCredits,
            type: "ADMIN_ADJUSTMENT",
            note: "Beta invite credits",
          },
        });

        await prisma.betaInvite.update({
          where: { email: data.user.email },
          data: { usedAt: new Date(), usedByUserId: user.id },
        });
      }

      // Redirect based on profile completion
      if (!user.profileCompleted) {
        if (hasCreatorInvite || user.role === "CREATOR") {
          return NextResponse.redirect(`${origin}/onboarding?creator=true`);
        }
        if (hasBetaInvite) {
          return NextResponse.redirect(`${origin}/marketplace`);
        }
        return NextResponse.redirect(`${origin}/onboarding`);
      }

      return NextResponse.redirect(`${origin}/marketplace`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
