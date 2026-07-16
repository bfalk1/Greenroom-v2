import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { safeRedirectPath } from "@/lib/safeRedirect";
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
        // Check by email (handles seeded accounts where Prisma ID might differ from
        // auth ID). Case-insensitive so a legacy mixed-case row still matches the
        // lowercased auth email instead of falling through to a duplicate account.
        user = await prisma.user.findFirst({
          where: { email: { equals: data.user.email, mode: "insensitive" } },
        });
      }

      let isNewUser = false;
      let hasCreatorInvite = false;
      let hasBetaInvite = false;
      let betaCredits = 0;
      let inviteArtistName: string | null = null;
      // Ids of the matched invite rows — used to key the "mark used" updates below
      // off the actual row, so they hit even a mixed-case invite the lookup matched.
      let creatorInviteId: string | null = null;
      let betaInviteId: string | null = null;

      // Only honor invites once the email is verified. Otherwise anyone who
      // signs up with someone else's invited address would inherit the CREATOR
      // role / credits / paywall bypass. If Supabase email confirmation is on,
      // email_confirmed_at is always set here; this is defense-in-depth in case
      // it is ever turned off. Unverified users are created as plain USERs and
      // can re-consume the invite on their next (verified) sign-in.
      const emailConfirmed = Boolean(data.user.email_confirmed_at);

      // Check for a valid creator invite (for both new and existing users)
      if (data.user.email && emailConfirmed) {
        // Case-insensitive so an invite row stored with any uppercase letter
        // (legacy rows the lowercase migration's collision guard skipped, or any
        // future un-normalized write) still matches the lowercased auth email.
        const invite = await prisma.creatorInvite.findFirst({
          where: { email: { equals: data.user.email, mode: "insensitive" } },
        });

        if (invite && !invite.usedAt && invite.expiresAt > new Date()) {
          hasCreatorInvite = true;
          inviteArtistName = invite.artistName;
          creatorInviteId = invite.id;
        }

        // Check for beta invite
        const betaInvite = await prisma.betaInvite.findFirst({
          where: { email: { equals: data.user.email, mode: "insensitive" } },
        });

        if (betaInvite && !betaInvite.usedAt && betaInvite.expiresAt > new Date()) {
          hasBetaInvite = true;
          betaCredits = betaInvite.credits;
          betaInviteId = betaInvite.id;
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

        // Create credit balance — upsert so a concurrent retry doesn't fail.
        await prisma.creditBalance.upsert({
          where: { userId: data.user.id },
          create: { userId: data.user.id, balance: hasBetaInvite ? betaCredits : 0 },
          update: { balance: hasBetaInvite ? betaCredits : 0 },
        });

        // Apply beta invite: subscription bypass + transaction record.
        // Credits already live in creditBalance from the upsert above.
        if (hasBetaInvite && data.user.email) {
          await prisma.user.update({
            where: { id: user.id },
            data: { subscriptionStatus: "active" },
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
            where: { id: betaInviteId! },
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
      if (hasCreatorInvite && creatorInviteId) {
        await prisma.creatorInvite.update({
          where: { id: creatorInviteId },
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
          data: { subscriptionStatus: "active" },
        });

        // Upsert so a missing balance row doesn't silently leave the credits unrecorded.
        await prisma.creditBalance.upsert({
          where: { userId: user.id },
          create: { userId: user.id, balance: betaCredits },
          update: { balance: { increment: betaCredits } },
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
          where: { id: betaInviteId! },
          data: { usedAt: new Date(), usedByUserId: user.id },
        });
      }

      // Optional post-confirmation destination carried from signup (e.g. the
      // /vip lifetime flow). Same-origin relative paths only.
      const safeRedirect = safeRedirectPath(searchParams.get("redirect"));
      const redirectQuery = safeRedirect
        ? `redirect=${encodeURIComponent(safeRedirect)}`
        : "";

      // Redirect based on profile completion. A brand-new user still completes
      // onboarding first — but the redirect is carried THROUGH onboarding so a
      // new user who signed up via /vip returns there once their profile exists.
      if (!user.profileCompleted) {
        if (hasCreatorInvite || user.role === "CREATOR") {
          return NextResponse.redirect(
            `${origin}/onboarding?creator=true${redirectQuery ? `&${redirectQuery}` : ""}`
          );
        }
        // Mid-checkout signup (email confirmation or Google OAuth from the
        // /checkout page): send the buyer straight back to their tier, not
        // through onboarding — profile completion can happen post-purchase,
        // and every extra step at the payment moment sheds buyers.
        if (safeRedirect?.startsWith("/checkout")) {
          return NextResponse.redirect(`${origin}${safeRedirect}`);
        }
        return NextResponse.redirect(
          `${origin}/onboarding${redirectQuery ? `?${redirectQuery}` : ""}`
        );
      }

      return NextResponse.redirect(`${origin}${safeRedirect ?? "/marketplace"}`);
    }
  }

  // Exchange failed (typically a confirmation link opened in a different
  // browser/device than the one that signed up — the PKCE verifier lives in
  // that browser's storage) or no code at all. Land on login with a notice
  // that explains what happened and the redirect intact, instead of the old
  // silent strand: the account IS usually confirmed at this point, so signing
  // in completes the journey.
  const failedRedirect = safeRedirectPath(searchParams.get("redirect"));
  return NextResponse.redirect(
    `${origin}/login?error=confirm_link${
      failedRedirect ? `&redirect=${encodeURIComponent(failedRedirect)}` : ""
    }`
  );
}
