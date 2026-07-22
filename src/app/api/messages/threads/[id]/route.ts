import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { sendNewMessageEmailSafe } from "@/lib/notifications";

// GET /api/messages/threads/[id] — thread + messages (ascending).
// Access: owner, or MODERATOR/ADMIN. Viewing clears the viewer's unread flag.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const thread = await prisma.messageThread.findUnique({ where: { id } });
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Ownership FIRST — a moderator's own thread is viewed as its user side.
    const isOwner = thread.userId === user.id;
    if (!isOwner) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      });
      if (!dbUser || (dbUser.role !== "MODERATOR" && dbUser.role !== "ADMIN")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100") || 100, 200);
    const offset = Math.max(
      0,
      Math.min(parseInt(searchParams.get("offset") || "0") || 0, 10000)
    );

    const [rows, total] = await Promise.all([
      prisma.message.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: "asc" },
        take: limit,
        skip: offset,
        include: {
          sender: { select: { artistName: true, username: true } },
        },
      }),
      prisma.message.count({ where: { threadId: thread.id } }),
    ]);

    // senderName is only meaningful to staff viewers — user-facing UI always
    // renders staff messages as "Greenroom Team".
    const messages = rows.map((m) => ({
      id: m.id,
      senderRole: m.senderRole,
      senderName: m.sender?.artistName || m.sender?.username || null,
      body: m.body,
      createdAt: m.createdAt,
    }));

    // Side effects after loading: clear the viewer's unread flag, and (owner
    // only) mark notifications linked to this thread as read.
    const sideEffects: Promise<unknown>[] = [];
    if (isOwner && thread.userUnread) {
      sideEffects.push(
        prisma.messageThread.update({
          where: { id: thread.id },
          data: { userUnread: false },
        })
      );
    }
    if (!isOwner && thread.staffUnread) {
      sideEffects.push(
        prisma.messageThread.update({
          where: { id: thread.id },
          data: { staffUnread: false },
        })
      );
    }
    if (isOwner) {
      sideEffects.push(
        prisma.notification.updateMany({
          where: { userId: user.id, threadId: thread.id, readAt: null },
          data: { readAt: new Date() },
        })
      );
    }
    if (sideEffects.length > 0) await Promise.all(sideEffects);

    return NextResponse.json({
      thread: {
        id: thread.id,
        subject: thread.subject,
        status: thread.status,
        contextType: thread.contextType,
        contextId: thread.contextId,
        userId: thread.userId,
        lastMessageAt: thread.lastMessageAt,
      },
      messages,
      total,
    });
  } catch (error) {
    console.error("GET /api/messages/threads/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/messages/threads/[id] — reply in a thread. { body }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw = await req.json();
    const messageBody =
      typeof raw.body === "string" ? (raw.body as string).trim() : "";

    if (messageBody.length < 1 || messageBody.length > 5000) {
      return NextResponse.json(
        { error: "Message must be between 1 and 5000 characters" },
        { status: 400 }
      );
    }

    const rl = await rateLimit(`msg-reply:${user.id}`, {
      limit: 10,
      windowSec: 60,
    });
    if (!rl.success) return tooManyRequests();

    const thread = await prisma.messageThread.findUnique({ where: { id } });
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Ownership FIRST — even a MODERATOR replying in their own thread is the
    // USER side (must not self-label STAFF or self-flip userUnread).
    const isOwner = thread.userId === user.id;
    if (!isOwner) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      });
      if (!dbUser || (dbUser.role !== "MODERATOR" && dbUser.role !== "ADMIN")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const now = new Date();
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          threadId: thread.id,
          senderId: user.id,
          senderRole: isOwner ? "USER" : "STAFF",
          body: messageBody,
        },
      }),
      prisma.messageThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: now,
          status: "OPEN", // replying reopens a closed thread
          ...(isOwner ? { staffUnread: true } : { userUnread: true }),
        },
      }),
    ]);

    // After commit: alert the user about the staff reply (throttled, never throws).
    if (!isOwner) {
      await sendNewMessageEmailSafe(thread.userId, thread.id);
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("POST /api/messages/threads/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
