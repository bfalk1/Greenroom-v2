import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

// Helper to send invite email
async function sendInviteEmail(invite: {
  id: string;
  email: string;
  artistName: string;
  message: string | null;
  token: string;
}) {
  const signupUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://greenroom.fm"}/signup?invite=${invite.token}`;

  await sendEmail({
    to: invite.email,
    subject: `Your Exclusive Creator Invite - GREENROOM`,
    text: `GREENROOM - A New Era of Greenroom

The world's first open sample marketplace

Your Exclusive Creator Invite
Welcome to the Greenroom

This is your invite to participate in our early access creator program.

As a Greenroom creator, you can:
- Upload your samples on your own schedule
- Earn money from every download
- View detailed download and earnings analytics
- Curate your artist page, and use it to promote your own music

Discover Greenroom: ${signupUrl}

© GREENROOM`,
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>body{margin:0;padding:0}@media(max-width:670px){.hero h1{font-size:34px!important}.content{padding:0 20px!important}}</style></head><body style="margin:0;padding:0;background:#000;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#000"><tr><td align="center"><table width="650" cellpadding="0" cellspacing="0" style="max-width:650px;width:100%"><tr><td align="center" style="padding:20px 0"><a href="https://greenroom.fm"><img src="https://dd051744b0.imgdist.com/pub/bfra/m3dfpaba/bbb/acc/3d1/GREENROOM_LOGO_WHITE.png" width="300" alt="GREENROOM" style="display:block;border:0;max-width:100%;height:auto"></a></td></tr><tr><td class="hero" style="background:#1a1a1a url('https://39d7c3c83a.imgdist.com/public/users/BeeFree/beefree-43046696-284b-4f67-80b0-cc70b1fef900/white-and-black-electronic-piano-744322.jpg') center/cover no-repeat;padding:50px 15px;text-align:center"><p style="margin:0 0 16px;color:#fff;font-size:16px;letter-spacing:16px">04.01.2026</p><h1 style="margin:0 0 16px;color:#fff;font-size:56px;font-weight:bold;letter-spacing:-1px;line-height:1.2">A New Era of Greenroom</h1><p style="margin:0;color:#fff;font-size:16px;font-weight:700">The world's first open sample marketplace</p></td></tr><tr><td class="content" style="padding:20px 40px;text-align:center"><p style="margin:0 0 8px;color:#fff;font-size:19px;font-weight:bold">Your Exclusive Creator Invite</p><p style="margin:0 0 12px;color:#60b358;font-size:31px;font-weight:bold">Welcome to the Greenroom</p><p style="margin:0 0 20px;color:#fff;font-size:14px">This is your invite to participate in our early access creator program.</p><p style="margin:0 0 16px;color:#fff;font-size:17px;font-weight:bold">As a Greenroom creator, you can:</p><p style="margin:0 0 30px;color:#fff;font-size:14px;text-align:left;padding:0 20px;line-height:1.6">- Upload your samples on your own schedule<br>- Earn money from every download<br>- View detailed download and earnings analytics<br>- Curate your artist page, and use it to promote your own music</p><p style="margin:0 0 40px"><a href="${signupUrl}" style="display:inline-block;background:#60b358;color:#fff;padding:15px 30px;font-size:16px;font-weight:700;text-decoration:none;border-radius:2px">Discover Greenroom</a></p></td></tr><tr><td style="padding:20px;text-align:center;border-top:1px solid #222"><p style="margin:0;color:#666;font-size:12px">© GREENROOM</p></td></tr></table></td></tr></table></body></html>`,
  });
}

// GET - List all creator invites
export async function GET() {
  console.log("[Invites API] GET started");
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log("[Invites API] Auth:", { userId: user?.id, error: authError?.message });

    if (!user) {
      return NextResponse.json({ error: "Unauthorized", details: authError?.message }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    console.log("[Invites API] DB user:", { found: !!dbUser, role: dbUser?.role });

    if (!dbUser || !["ADMIN", "MODERATOR"].includes(dbUser.role)) {
      return NextResponse.json({ error: "Forbidden", details: `Role '${dbUser?.role}' not authorized` }, { status: 403 });
    }

    const invites = await prisma.creatorInvite.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        inviter: { select: { id: true, email: true, username: true, artistName: true } },
        usedBy: { select: { id: true, email: true, username: true, artistName: true } },
      },
    });

    console.log("[Invites API] Found", invites.length, "invites");
    return NextResponse.json({ invites });
  } catch (error) {
    console.error("[Invites API] Error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

// POST - Create new creator invite and send email
export async function POST(request: NextRequest) {
  console.log("[Invites API] POST started");
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log("[Invites API] POST Auth:", { userId: user?.id, error: authError?.message });

    if (!user) {
      return NextResponse.json({ error: "Unauthorized", details: authError?.message }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !["ADMIN", "MODERATOR"].includes(dbUser.role)) {
      return NextResponse.json({ error: "Forbidden", details: `Role '${dbUser?.role}'` }, { status: 403 });
    }

    const body = await request.json();
    const { email, artistName, message } = body;
    console.log("[Invites API] POST body:", { email, artistName });

    if (!email || !artistName) {
      console.log("[Invites API] Missing email or artistName");
      return NextResponse.json({ error: "Email and artist name are required" }, { status: 400 });
    }

    // Check if email already has an account
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      console.log("[Invites API] User already exists:", { email, userId: existingUser.id });
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 400 });
    }

    // Check for existing pending invite
    const existingInvite = await prisma.creatorInvite.findUnique({ where: { email } });
    console.log("[Invites API] Existing invite check:", { email, found: !!existingInvite, usedAt: existingInvite?.usedAt, expiresAt: existingInvite?.expiresAt });
    if (existingInvite && !existingInvite.usedAt && existingInvite.expiresAt > new Date()) {
      console.log("[Invites API] Active invite already exists");
      return NextResponse.json({ error: "An active invite already exists for this email" }, { status: 400 });
    }

    // Delete old expired/used invite if exists
    if (existingInvite) {
      await prisma.creatorInvite.delete({ where: { email } });
    }

    // Create invite (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = await prisma.creatorInvite.create({
      data: { email, artistName, message, invitedBy: user.id, expiresAt, emailStatus: "pending" },
    });
    console.log("[Invites API] Created invite:", invite.id);

    // Try to send email
    try {
      console.log("[Invites API] Attempting to send email to:", email);
      await sendInviteEmail(invite);
      console.log("[Invites API] Email sent successfully");

      await prisma.creatorInvite.update({
        where: { id: invite.id },
        data: { emailStatus: "sent", emailSentAt: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: "CREATOR_INVITED",
          targetType: "CreatorInvite",
          targetId: invite.id,
          metadata: { email, artistName, emailStatus: "sent" },
        },
      });

      return NextResponse.json({ success: true, invite: { ...invite, emailStatus: "sent" } });
    } catch (emailErr) {
      const emailError = emailErr instanceof Error ? emailErr.message : "Unknown email error";
      console.error("[Invites API] Email failed:", { inviteId: invite.id, email, error: emailError, stack: emailErr instanceof Error ? emailErr.stack : undefined });

      await prisma.creatorInvite.update({
        where: { id: invite.id },
        data: { emailStatus: "failed", emailError: emailError.substring(0, 500), retryCount: 1 },
      });

      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: "CREATOR_INVITE_EMAIL_FAILED",
          targetType: "CreatorInvite",
          targetId: invite.id,
          metadata: { email, artistName, emailStatus: "failed", error: emailError.substring(0, 200) },
        },
      });

      return NextResponse.json({
        success: true,
        invite: { ...invite, emailStatus: "failed", emailError },
        warning: `Invite created but email failed: ${emailError}`,
      });
    }
  } catch (error) {
    console.error("[Invites API] POST error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

// PATCH - Retry sending email for a failed invite
export async function PATCH(request: NextRequest) {
  console.log("[Invites API] PATCH started");
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !["ADMIN", "MODERATOR"].includes(dbUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { inviteId } = body;

    if (!inviteId) {
      return NextResponse.json({ error: "Invite ID required" }, { status: 400 });
    }

    const invite = await prisma.creatorInvite.findUnique({ where: { id: inviteId } });
    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    if (invite.usedAt) {
      return NextResponse.json({ error: "Invite already used" }, { status: 400 });
    }
    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invite expired" }, { status: 400 });
    }
    if (invite.emailStatus === "sent") {
      return NextResponse.json({ error: "Email already sent" }, { status: 400 });
    }

    try {
      console.log("[Invites API] Retrying email for:", invite.email);
      await sendInviteEmail(invite);

      await prisma.creatorInvite.update({
        where: { id: invite.id },
        data: { emailStatus: "sent", emailSentAt: new Date(), emailError: null },
      });

      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: "CREATOR_INVITE_RESENT",
          targetType: "CreatorInvite",
          targetId: invite.id,
          metadata: { email: invite.email, retryCount: invite.retryCount + 1 },
        },
      });

      return NextResponse.json({ success: true, message: "Email sent successfully" });
    } catch (emailErr) {
      const emailError = emailErr instanceof Error ? emailErr.message : "Unknown error";
      console.error("[Invites API] Retry failed:", { inviteId, error: emailError });

      await prisma.creatorInvite.update({
        where: { id: invite.id },
        data: { emailError: emailError.substring(0, 500), retryCount: invite.retryCount + 1 },
      });

      return NextResponse.json({ error: `Failed to send email: ${emailError}` }, { status: 500 });
    }
  } catch (error) {
    console.error("[Invites API] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

// DELETE - Cancel/revoke an invite
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !["ADMIN", "MODERATOR"].includes(dbUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const inviteId = searchParams.get("id");

    if (!inviteId) {
      return NextResponse.json({ error: "Invite ID required" }, { status: 400 });
    }

    const invite = await prisma.creatorInvite.findUnique({ where: { id: inviteId } });
    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    if (invite.usedAt) {
      return NextResponse.json({ error: "Cannot delete used invite" }, { status: 400 });
    }

    await prisma.creatorInvite.delete({ where: { id: inviteId } });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "CREATOR_INVITE_REVOKED",
        targetType: "CreatorInvite",
        targetId: inviteId,
        metadata: { email: invite.email },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Invites API] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}
