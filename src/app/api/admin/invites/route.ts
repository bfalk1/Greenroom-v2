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
    subject: `You've been invited to become a GREENROOM Creator`,
    text: `Hi ${invite.artistName},\n\nYou've been invited to become a GREENROOM Creator!\n\n${invite.message ? `Message from the team: ${invite.message}\n\n` : ""}As a GREENROOM Creator, you can:\n• Upload and sell your samples\n• Earn money from every download\n• Build your audience\n• Connect with music producers worldwide\n\nClick here to sign up: ${signupUrl}\n\nThis invite expires in 7 days.\n\n© GREENROOM`,
    html: `
      <div style="font-family: 'GT America', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #000000; padding: 48px 32px;">
        <!-- Logo -->
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-family: 'Eurostile', 'Arial Black', Impact, sans-serif; color: #ffffff; margin: 0; font-size: 36px; font-weight: 900; letter-spacing: 2px;">GREENROOM<span style="color: #39b54a;">·</span></h1>
        </div>
        
        <!-- Welcome Text -->
        <p style="font-family: 'GT America', -apple-system, sans-serif; color: #ffffff; text-align: center; font-size: 14px; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 24px 0;">WELCOME TO THE GREENROOM</p>
        
        <!-- Greeting -->
        <p style="font-family: 'GT America Mono', 'SF Mono', 'Monaco', 'Consolas', monospace; color: #ffffff; text-align: center; font-size: 14px; margin: 0 0 32px 0;">Hi ${invite.artistName},</p>
        
        <!-- Main Headline -->
        <h2 style="font-family: 'Eurostile', 'Arial Black', Impact, sans-serif; color: #39b54a; text-align: center; font-size: 24px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 40px 0;">YOU'VE BEEN INVITED TO BECOME A CREATOR.</h2>
        
        ${invite.message ? `<div style="background: #1a1a1a; border-radius: 8px; padding: 20px; margin-bottom: 32px; border-left: 4px solid #39b54a;"><p style="font-family: 'GT America Mono', monospace; color: #a1a1a1; margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Message from the team:</p><p style="font-family: 'GT America', sans-serif; color: #ffffff; margin: 0; font-size: 14px;">${invite.message}</p></div>` : ""}
        
        <!-- Benefits Box -->
        <div style="background: #1a1a1a; border-radius: 12px; padding: 28px 32px; margin-bottom: 40px;">
          <p style="font-family: 'GT America', -apple-system, sans-serif; color: #ffffff; margin: 0 0 20px 0; font-size: 15px;">As a GREENROOM Creator, you can:</p>
          <ul style="font-family: 'GT America', -apple-system, sans-serif; color: #a1a1a1; margin: 0; padding-left: 20px; font-size: 14px; line-height: 2;">
            <li style="margin-bottom: 4px;">Upload and sell your samples</li>
            <li style="margin-bottom: 4px;">Earn money from every download</li>
            <li style="margin-bottom: 4px;">Build your audience</li>
            <li>Connect with music producers worldwide</li>
          </ul>
        </div>
        
        <!-- CTA Button -->
        <div style="text-align: center; margin-bottom: 40px;">
          <a href="${signupUrl}" style="display: inline-block; background: #39b54a; color: #000000; padding: 18px 48px; border-radius: 8px; text-decoration: none; font-family: 'GT America', -apple-system, sans-serif; font-weight: 700; font-size: 14px; letter-spacing: 1px; text-transform: uppercase;">ACCEPT INVITE & SIGN UP</a>
        </div>
        
        <!-- Footer -->
        <p style="font-family: 'GT America', -apple-system, sans-serif; color: #666666; font-size: 12px; text-align: center; margin: 0;">This invite expires in 7 days.<br>© GREENROOM</p>
        <p style="font-family: 'GT America', -apple-system, sans-serif; color: #444444; font-size: 11px; text-align: center; margin-top: 16px;">
          <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color: #444444;">Unsubscribe</a>
        </p>
      </div>
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
