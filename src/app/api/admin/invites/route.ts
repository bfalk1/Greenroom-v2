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
    text: `GREENROOM - A New Era

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
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #000000; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #000000;">
    <tr>
      <td align="center" style="padding: 0;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          
          <!-- Logo -->
          <tr>
            <td align="center" style="padding: 32px 20px 24px 20px; background-color: #000000;">
              <h1 style="margin: 0; font-size: 40px; font-weight: 800; letter-spacing: 2px; color: #ffffff; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; text-transform: uppercase;">GREENROOM<span style="color: #4CAF50; font-size: 32px; vertical-align: middle; margin-left: 2px;">•</span></h1>
            </td>
          </tr>
          
          <!-- Hero Section -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 50%, #1a1a1a 100%);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 60px 40px; text-align: center;">
                    <p style="margin: 0 0 16px 0; font-size: 14px; letter-spacing: 6px; color: #999999; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;">0 4 . 0 1 . 2 0 2 5</p>
                    <h2 style="margin: 0 0 20px 0; font-size: 52px; font-weight: 400; color: #ffffff; font-family: Georgia, 'Times New Roman', serif; font-style: italic;">A New Era</h2>
                    <p style="margin: 0; font-size: 16px; color: #cccccc; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;">The world's first open sample marketplace</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 48px 40px; background-color: #000000;">
              <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 700; color: #ffffff; text-align: center; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;">Your Exclusive Creator Invite</h3>
              <h2 style="margin: 0 0 20px 0; font-size: 38px; font-weight: 400; color: #4CAF50; text-align: center; font-family: Georgia, 'Times New Roman', serif; font-style: italic;">Welcome to the Greenroom</h2>
              <p style="margin: 0 0 36px 0; font-size: 16px; color: #ffffff; text-align: center; line-height: 1.6; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;">This is your invite to participate in our early access creator program.</p>
              
              <h4 style="margin: 0 0 24px 0; font-size: 22px; font-weight: 400; color: #4CAF50; text-align: center; font-family: Georgia, 'Times New Roman', serif; font-style: italic;">As a Greenroom creator, you can:</h4>
              
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 40px;">
                <tr><td style="padding: 8px 0; font-size: 15px; color: #ffffff; line-height: 1.6; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;">- Upload your samples on your own schedule</td></tr>
                <tr><td style="padding: 8px 0; font-size: 15px; color: #ffffff; line-height: 1.6; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;">- Earn money from every download</td></tr>
                <tr><td style="padding: 8px 0; font-size: 15px; color: #ffffff; line-height: 1.6; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;">- View detailed download and earnings analytics</td></tr>
                <tr><td style="padding: 8px 0; font-size: 15px; color: #ffffff; line-height: 1.6; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;">- Curate your artist page, and use it to promote your own music</td></tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${signupUrl}" style="display: inline-block; background-color: #4CAF50; color: #ffffff; padding: 16px 48px; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 4px;">Discover Greenroom</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #000000; border-top: 1px solid #222;">
              <p style="margin: 0; font-size: 12px; color: #666666; text-align: center;">© GREENROOM</p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
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
