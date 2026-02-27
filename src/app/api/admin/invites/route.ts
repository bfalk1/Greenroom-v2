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
    subject: `🎵 You're invited to join GREENROOM as a Creator!`,
    text: `Hi ${invite.artistName},\n\nYou've been invited to join GREENROOM as a Creator!\n\n${invite.message ? `Message from the team: ${invite.message}\n\n` : ""}Click here to sign up: ${signupUrl}\n\nThis invite expires in 7 days.\n\n- The GREENROOM Team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #00FF88; margin: 0; font-size: 28px;">GREENROOM</h1>
        </div>
        
        <h2 style="color: #ffffff; margin-bottom: 8px; text-align: center;">You're Invited! 🎵</h2>
        <p style="color: #a1a1a1; margin-bottom: 24px; text-align: center;">Hi ${invite.artistName},</p>
        
        <div style="background: linear-gradient(135deg, #00FF88 0%, #00cc6a 100%); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <p style="color: #000000; margin: 0; font-size: 18px; font-weight: bold;">You've been invited to join GREENROOM as a Creator!</p>
        </div>
        
        ${invite.message ? `
        <div style="background: #1a1a1a; border-radius: 8px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #00FF88;">
          <p style="color: #a1a1a1; margin: 0 0 8px; font-size: 12px; text-transform: uppercase;">Message from the team:</p>
          <p style="color: #ffffff; margin: 0;">${invite.message}</p>
        </div>
        ` : ""}
        
        <div style="background: #1a1a1a; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #ffffff; margin: 0 0 12px;">As a GREENROOM Creator, you can:</p>
          <ul style="color: #a1a1a1; margin: 0; padding-left: 20px;">
            <li style="margin-bottom: 8px;">Upload and sell your samples</li>
            <li style="margin-bottom: 8px;">Earn money from every download</li>
            <li style="margin-bottom: 8px;">Build your audience</li>
            <li>Connect with music producers worldwide</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${signupUrl}" style="display: inline-block; background: #00FF88; color: #000000; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Accept Invite & Sign Up</a>
        </div>
        
        <p style="color: #666666; font-size: 12px; text-align: center;">
          This invite expires in 7 days.<br>
          © GREENROOM • <a href="https://greenroom.fm" style="color: #666666;">greenroom.fm</a>
        </p>
      </div>
    `,
  });
}

// GET - List all creator invites
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser || !["ADMIN", "MODERATOR"].includes(dbUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = await prisma.creatorInvite.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      inviter: {
        select: { id: true, email: true, username: true, artistName: true },
      },
      usedBy: {
        select: { id: true, email: true, username: true, artistName: true },
      },
    },
  });

  return NextResponse.json({ invites });
}

// POST - Create new creator invite and send email
export async function POST(request: NextRequest) {
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
  const { email, artistName, message } = body;

  if (!email || !artistName) {
    return NextResponse.json(
      { error: "Email and artist name are required" },
      { status: 400 }
    );
  }

  // Check if email already has an account
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 400 }
    );
  }

  // Check for existing pending invite
  const existingInvite = await prisma.creatorInvite.findUnique({
    where: { email },
  });
  if (existingInvite && !existingInvite.usedAt && existingInvite.expiresAt > new Date()) {
    return NextResponse.json(
      { error: "An active invite already exists for this email" },
      { status: 400 }
    );
  }

  // Delete old expired/used invite if exists
  if (existingInvite) {
    await prisma.creatorInvite.delete({ where: { email } });
  }

  // Create invite (expires in 7 days)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const invite = await prisma.creatorInvite.create({
    data: {
      email,
      artistName,
      message,
      invitedBy: user.id,
      expiresAt,
      emailStatus: "pending",
    },
  });

  // Try to send email
  let emailError: string | null = null;
  try {
    await sendInviteEmail(invite);
    
    // Update invite with success status
    await prisma.creatorInvite.update({
      where: { id: invite.id },
      data: {
        emailStatus: "sent",
        emailSentAt: new Date(),
      },
    });

    // Log success
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

  } catch (error) {
    // Extract error message
    emailError = error instanceof Error ? error.message : "Unknown email error";
    
    // Log detailed error
    console.error("Failed to send invite email:", {
      inviteId: invite.id,
      email,
      artistName,
      error: emailError,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Update invite with failure status (but keep the invite)
    await prisma.creatorInvite.update({
      where: { id: invite.id },
      data: {
        emailStatus: "failed",
        emailError: emailError.substring(0, 500), // Truncate long errors
        retryCount: 1,
      },
    });

    // Log the failure
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "CREATOR_INVITE_EMAIL_FAILED",
        targetType: "CreatorInvite",
        targetId: invite.id,
        metadata: { 
          email, 
          artistName, 
          emailStatus: "failed",
          error: emailError.substring(0, 200),
        },
      },
    });

    // Return success but with email failure info
    return NextResponse.json({ 
      success: true, 
      invite: { ...invite, emailStatus: "failed", emailError },
      warning: `Invite created but email failed to send: ${emailError}`,
    });
  }
}

// PATCH - Retry sending email for a failed invite
export async function PATCH(request: NextRequest) {
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

  const invite = await prisma.creatorInvite.findUnique({
    where: { id: inviteId },
  });

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
    return NextResponse.json({ error: "Email already sent successfully" }, { status: 400 });
  }

  // Try to resend
  try {
    await sendInviteEmail(invite);

    await prisma.creatorInvite.update({
      where: { id: invite.id },
      data: {
        emailStatus: "sent",
        emailSentAt: new Date(),
        emailError: null,
      },
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

  } catch (error) {
    const emailError = error instanceof Error ? error.message : "Unknown error";

    console.error("Failed to resend invite email:", {
      inviteId: invite.id,
      email: invite.email,
      error: emailError,
      retryCount: invite.retryCount + 1,
      timestamp: new Date().toISOString(),
    });

    await prisma.creatorInvite.update({
      where: { id: invite.id },
      data: {
        emailError: emailError.substring(0, 500),
        retryCount: invite.retryCount + 1,
      },
    });

    return NextResponse.json(
      { error: `Failed to send email: ${emailError}` },
      { status: 500 }
    );
  }
}

// DELETE - Cancel/revoke an invite
export async function DELETE(request: NextRequest) {
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

  const invite = await prisma.creatorInvite.findUnique({
    where: { id: inviteId },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.usedAt) {
    return NextResponse.json(
      { error: "Cannot delete used invite" },
      { status: 400 }
    );
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
}
