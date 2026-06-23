import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail, EMAIL_SITE_URL, INVITE_FROM_EMAIL } from "@/lib/email";
import {
  wrapEmailHtml,
  emailHeading,
  emailLede,
  emailParagraph,
  emailButton,
  emailStatCard,
  emailQuote,
  EMAIL_COLORS,
} from "@/lib/email-layout";

// Credit threshold at or above which an invite is treated as "premium / unlimited"
// and receives the higher-end email template.
const PREMIUM_CREDIT_THRESHOLD = 100_000;

async function sendBetaInviteEmail(invite: {
  id: string;
  email: string;
  message: string | null;
  token: string;
  credits: number;
}) {
  const signupUrl = `${EMAIL_SITE_URL}/signup?beta=${invite.token}`;

  if (invite.credits >= PREMIUM_CREDIT_THRESHOLD) {
    await sendPremiumInviteEmail({ ...invite, signupUrl });
    return;
  }

  const content = `
${emailHeading("You're invited to the beta")}
${emailLede("You've been invited to beta test Greenroom — the world's first open sample marketplace.")}
${emailStatCard(String(invite.credits), "Credits to explore and download samples")}
${invite.message ? emailQuote(invite.message) : ""}
${emailButton(signupUrl, "Join the Beta")}
`;

  await sendEmail({
    to: invite.email,
    from: INVITE_FROM_EMAIL,
    subject: "Your Greenroom beta invite",
    text: `You've been invited to beta test Greenroom — the world's first open sample marketplace.

You'll get ${invite.credits} credits to explore and download samples from our creator community.

${invite.message ? `Note from the team: ${invite.message}\n\n` : ""}Sign up here: ${signupUrl}

---
You're receiving this because someone invited you to beta test Greenroom.

© Greenroom`,
    html: wrapEmailHtml({
      preheader: `You've been invited to beta test Greenroom — ${invite.credits} credits inside.`,
      content,
      whyReceiving: "You're receiving this because someone invited you to beta test Greenroom.",
    }),
  });
}

async function sendPremiumInviteEmail(invite: {
  email: string;
  message: string | null;
  signupUrl: string;
}) {
  const content = `
${emailHeading("You've been granted unlimited access")}
${emailLede("A personal invitation to Greenroom — the world's first open sample marketplace. Your account has been pre-loaded with unrestricted access to the full creator catalog.")}
${emailStatCard("Unlimited", "No caps. No throttling. No expiration.", EMAIL_COLORS.gold)}
${invite.message ? emailQuote(invite.message) : ""}
${emailButton(invite.signupUrl, "Activate Access", "premium")}
${emailParagraph("This invitation is personal and non-transferable.", EMAIL_COLORS.textMuted)}
`;

  await sendEmail({
    to: invite.email,
    from: INVITE_FROM_EMAIL,
    subject: "Your Greenroom access is ready",
    text: `You've been granted unlimited access to Greenroom — the world's first open sample marketplace.

Your account has been pre-loaded with unlimited credits. Download anything. No caps. No throttling. Full creator catalog.

${invite.message ? `A note from the team: ${invite.message}\n\n` : ""}Activate your access here: ${invite.signupUrl}

This invitation is personal and non-transferable.

---
You're receiving this because you were granted personal access to Greenroom.

© Greenroom`,
    html: wrapEmailHtml({
      preheader: "Your Greenroom access is ready.",
      content,
      whyReceiving: "You're receiving this because you were granted personal access to Greenroom.",
      variant: "premium",
    }),
  });
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser || !["ADMIN", "MODERATOR"].includes(dbUser.role)) return null;

  return dbUser;
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const invites = await prisma.betaInvite.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        inviter: { select: { id: true, email: true, username: true, artistName: true } },
        usedBy: { select: { id: true, email: true, username: true, artistName: true } },
      },
    });

    return NextResponse.json({ invites });
  } catch (error) {
    console.error("[Beta Invites] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { email, message, credits } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Optional custom credit grant (e.g. infinite/premium invites). Postgres int max is ~2.1B.
    // Only ADMINs may set a custom amount — a MODERATOR issuing invites gets the
    // default grant, so a rogue/compromised moderator can't mint large balances.
    let creditsOverride: number | undefined;
    if (credits !== undefined) {
      if (typeof credits !== "number" || !Number.isInteger(credits) || credits < 0 || credits > 2_000_000_000) {
        return NextResponse.json({ error: "Credits must be a non-negative integer under 2,000,000,000" }, { status: 400 });
      }
      if (admin.role !== "ADMIN") {
        return NextResponse.json({ error: "Only admins can set a custom credit amount on invites" }, { status: 403 });
      }
      creditsOverride = credits;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 400 });
    }

    const existingInvite = await prisma.betaInvite.findUnique({ where: { email } });
    if (existingInvite && !existingInvite.usedAt && existingInvite.expiresAt > new Date()) {
      return NextResponse.json({ error: "An active beta invite already exists for this email" }, { status: 400 });
    }

    if (existingInvite) {
      await prisma.betaInvite.delete({ where: { email } });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const invite = await prisma.betaInvite.create({
      data: {
        email,
        message,
        invitedBy: admin.id,
        expiresAt,
        emailStatus: "pending",
        ...(creditsOverride !== undefined ? { credits: creditsOverride } : {}),
      },
    });

    try {
      await sendBetaInviteEmail(invite);

      await prisma.betaInvite.update({
        where: { id: invite.id },
        data: { emailStatus: "sent", emailSentAt: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: "BETA_USER_INVITED",
          targetType: "BetaInvite",
          targetId: invite.id,
          metadata: { email, emailStatus: "sent", credits: invite.credits },
        },
      });

      return NextResponse.json({ success: true, invite: { ...invite, emailStatus: "sent" } });
    } catch (emailErr) {
      const emailError = emailErr instanceof Error ? emailErr.message : "Unknown email error";
      console.error("[Beta Invites] Email failed:", emailError);

      await prisma.betaInvite.update({
        where: { id: invite.id },
        data: { emailStatus: "failed", emailError: emailError.substring(0, 500), retryCount: 1 },
      });

      await prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: "BETA_INVITE_EMAIL_FAILED",
          targetType: "BetaInvite",
          targetId: invite.id,
          metadata: { email, emailStatus: "failed", error: emailError.substring(0, 200) },
        },
      });

      return NextResponse.json({
        success: true,
        invite: { ...invite, emailStatus: "failed", emailError },
        warning: `Invite created but email failed: ${emailError}`,
      });
    }
  } catch (error) {
    console.error("[Beta Invites] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { inviteId } = await request.json();
    if (!inviteId) return NextResponse.json({ error: "Invite ID required" }, { status: 400 });

    const invite = await prisma.betaInvite.findUnique({ where: { id: inviteId } });
    if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    if (invite.usedAt) return NextResponse.json({ error: "Invite already used" }, { status: 400 });
    if (invite.expiresAt < new Date()) return NextResponse.json({ error: "Invite expired" }, { status: 400 });

    try {
      await sendBetaInviteEmail(invite);

      await prisma.betaInvite.update({
        where: { id: invite.id },
        data: { emailStatus: "sent", emailSentAt: new Date(), emailError: null },
      });

      return NextResponse.json({ success: true, message: "Email sent successfully" });
    } catch (emailErr) {
      const emailError = emailErr instanceof Error ? emailErr.message : "Unknown error";

      await prisma.betaInvite.update({
        where: { id: invite.id },
        data: { emailError: emailError.substring(0, 500), retryCount: invite.retryCount + 1 },
      });

      return NextResponse.json({ error: `Failed to send email: ${emailError}` }, { status: 500 });
    }
  } catch (error) {
    console.error("[Beta Invites] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const inviteId = searchParams.get("id");
    if (!inviteId) return NextResponse.json({ error: "Invite ID required" }, { status: 400 });

    const invite = await prisma.betaInvite.findUnique({ where: { id: inviteId } });
    if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    if (invite.usedAt) return NextResponse.json({ error: "Cannot delete used invite" }, { status: 400 });

    await prisma.betaInvite.delete({ where: { id: inviteId } });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "BETA_INVITE_REVOKED",
        targetType: "BetaInvite",
        targetId: inviteId,
        metadata: { email: invite.email },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Beta Invites] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
