import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { sendNewMessageEmailSafe } from "@/lib/notifications";

// POST /api/mod/messages — staff opens a new thread with a user (MODERATOR/ADMIN)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, role: true },
    });

    if (!dbUser || (dbUser.role !== "MODERATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const raw = await req.json();
    const userId = typeof raw?.userId === "string" ? raw.userId : "";
    const subject = typeof raw?.subject === "string" ? raw.subject.trim() : "";
    const body = typeof raw?.body === "string" ? raw.body.trim() : "";
    const contextType =
      typeof raw?.contextType === "string" && raw.contextType.trim()
        ? raw.contextType.trim()
        : null;
    const contextId =
      typeof raw?.contextId === "string" && raw.contextId.trim()
        ? raw.contextId.trim()
        : null;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }
    if (subject.length < 1 || subject.length > 200) {
      return NextResponse.json(
        { error: "Subject must be 1-200 characters" },
        { status: 400 }
      );
    }
    if (body.length < 1 || body.length > 5000) {
      return NextResponse.json(
        { error: "Message must be 1-5000 characters" },
        { status: 400 }
      );
    }
    if (userId === dbUser.id) {
      return NextResponse.json(
        { error: "Cannot message yourself" },
        { status: 400 }
      );
    }

    const rl = await rateLimit(`mod-msg:${dbUser.id}`, {
      limit: 30,
      windowSec: 60,
    });
    if (!rl.success) {
      return tooManyRequests();
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const thread = await prisma.$transaction(async (tx) => {
      const created = await tx.messageThread.create({
        data: {
          userId,
          createdById: dbUser.id,
          subject,
          contextType,
          contextId,
          userUnread: true,
          lastMessageAt: new Date(),
        },
      });

      await tx.message.create({
        data: {
          threadId: created.id,
          senderId: dbUser.id,
          senderRole: "STAFF",
          body,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: dbUser.id,
          action: "MESSAGE_SENT",
          targetType: "User",
          targetId: userId,
          metadata: { threadId: created.id, subject },
        },
      });

      return created;
    });

    // After commit — never blocks or fails the send.
    await sendNewMessageEmailSafe(userId, thread.id);

    return NextResponse.json({ thread }, { status: 201 });
  } catch (error) {
    console.error("POST /api/mod/messages error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
