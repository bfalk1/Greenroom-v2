import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

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
  const signupUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://greenroom.fm"}/signup?beta=${invite.token}`;

  if (invite.credits >= PREMIUM_CREDIT_THRESHOLD) {
    await sendPremiumInviteEmail({ ...invite, signupUrl });
    return;
  }

  await sendEmail({
    to: invite.email,
    subject: "You're Invited to GREENROOM Beta",
    text: `You've been invited to beta test GREENROOM — the world's first open sample marketplace.

You'll get ${invite.credits} free credits to explore and download premium samples from our creator community.

${invite.message ? `Note from the team: ${invite.message}\n\n` : ""}Sign up here: ${signupUrl}

© GREENROOM`,
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#000;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#000"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td align="center" style="padding:40px 0 20px"><a href="https://greenroom.fm"><img src="https://dd051744b0.imgdist.com/pub/bfra/m3dfpaba/bbb/acc/3d1/GREENROOM_LOGO_WHITE.png" width="200" alt="GREENROOM" style="display:block;border:0;max-width:100%;height:auto"></a></td></tr><tr><td style="padding:20px 40px;text-align:center"><h1 style="margin:0 0 16px;color:#fff;font-size:28px;font-weight:bold">You're Invited to the Beta</h1><p style="margin:0 0 24px;color:#a1a1a1;font-size:16px;line-height:1.6">You've been selected to beta test GREENROOM — the world's first open sample marketplace.</p><div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:24px;margin:0 0 24px"><p style="margin:0 0 8px;color:#39b54a;font-size:36px;font-weight:bold">${invite.credits} Credits</p><p style="margin:0;color:#a1a1a1;font-size:14px">Free credits to explore and download samples</p></div>${invite.message ? `<div style="background:#1a1a1a;border-left:3px solid #39b54a;padding:16px 20px;margin:0 0 24px;text-align:left;border-radius:0 8px 8px 0"><p style="margin:0;color:#a1a1a1;font-size:14px;font-style:italic">"${invite.message}"</p></div>` : ""}<p style="margin:0 0 32px"><a href="${signupUrl}" style="display:inline-block;background:#39b54a;color:#000;padding:16px 40px;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px">Join the Beta</a></p></td></tr><tr><td style="padding:20px;text-align:center;border-top:1px solid #222"><p style="margin:0;color:#666;font-size:12px">© GREENROOM</p></td></tr></table></td></tr></table></body></html>`,
  });
}

async function sendPremiumInviteEmail(invite: {
  email: string;
  message: string | null;
  signupUrl: string;
}) {
  await sendEmail({
    to: invite.email,
    subject: "Your GREENROOM Premium Access is Ready",
    text: `You've been granted GREENROOM Premium — unlimited access to the world's first open sample marketplace.

Your account has been pre-loaded with unlimited credits. Download anything. No caps. No throttling. Full creator catalog.

${invite.message ? `A note from the team: ${invite.message}\n\n` : ""}Activate your access here: ${invite.signupUrl}

This invitation is personal and non-transferable.

© GREENROOM`,
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#000;font-family:Georgia,'Times New Roman',serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#000"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:linear-gradient(180deg,#0a0a0a 0%,#000 100%)"><tr><td align="center" style="padding:48px 0 24px"><a href="https://greenroom.fm"><img src="https://dd051744b0.imgdist.com/pub/bfra/m3dfpaba/bbb/acc/3d1/GREENROOM_LOGO_WHITE.png" width="200" alt="GREENROOM" style="display:block;border:0;max-width:100%;height:auto"></a></td></tr><tr><td align="center" style="padding:0 40px 12px"><p style="margin:0;color:#d4af37;font-size:12px;letter-spacing:4px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;font-weight:700">— Premium Access —</p></td></tr><tr><td style="padding:16px 40px 0;text-align:center"><h1 style="margin:0 0 20px;color:#fff;font-size:34px;font-weight:400;letter-spacing:-0.5px;line-height:1.2">You've been granted<br><span style="color:#d4af37;font-style:italic">unlimited access.</span></h1><p style="margin:0 0 32px;color:#a1a1a1;font-size:15px;line-height:1.7;font-family:Arial,Helvetica,sans-serif">A personal invitation to GREENROOM — the world's first open sample marketplace. Your account has been pre-loaded with unrestricted access to the full creator catalog.</p><table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px"><tr><td style="background:#0f0f0f;border:1px solid #d4af37;border-radius:2px;padding:32px 24px;text-align:center"><p style="margin:0 0 6px;color:#d4af37;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;font-weight:700">Credits</p><p style="margin:0 0 10px;color:#fff;font-size:48px;font-weight:300;font-family:Georgia,serif;letter-spacing:-1px">Unlimited</p><p style="margin:0;color:#777;font-size:13px;font-family:Arial,Helvetica,sans-serif;font-style:italic">No caps. No throttling. No expiration.</p></td></tr></table>${invite.message ? `<div style="background:#0a0a0a;border-left:2px solid #d4af37;padding:20px 24px;margin:0 0 32px;text-align:left"><p style="margin:0;color:#c4c4c4;font-size:14px;font-style:italic;font-family:Georgia,serif;line-height:1.6">"${invite.message}"</p><p style="margin:12px 0 0;color:#777;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif">— The GREENROOM team</p></div>` : ""}<p style="margin:0 0 16px"><a href="${invite.signupUrl}" style="display:inline-block;background:#d4af37;color:#000;padding:18px 56px;font-size:13px;font-weight:700;text-decoration:none;border-radius:2px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif">Activate Access</a></p><p style="margin:0 0 40px;color:#555;font-size:11px;font-family:Arial,Helvetica,sans-serif;letter-spacing:1px">This invitation is personal and non-transferable.</p></td></tr><tr><td style="padding:24px 40px;text-align:center;border-top:1px solid #1a1a1a"><p style="margin:0;color:#555;font-size:11px;font-family:Arial,Helvetica,sans-serif;letter-spacing:2px">© GREENROOM · PREMIUM</p></td></tr></table></td></tr></table></body></html>`,
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
    let creditsOverride: number | undefined;
    if (credits !== undefined) {
      if (typeof credits !== "number" || !Number.isInteger(credits) || credits < 0 || credits > 2_000_000_000) {
        return NextResponse.json({ error: "Credits must be a non-negative integer under 2,000,000,000" }, { status: 400 });
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
