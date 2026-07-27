import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";

// Sentinel thrown inside the create transaction when a concurrent request
// already claimed the notification (double-click race) — rolls the new thread
// back so the notification can never end up pointing at an orphan.
const CLAIM_LOST = "NOTIFICATION_THREAD_ALREADY_CLAIMED";

// GET /api/messages/threads — the caller's conversations, most recent first
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20") || 20, 50);
    const offset = Math.max(
      0,
      Math.min(parseInt(searchParams.get("offset") || "0") || 0, 10000)
    );

    const where = { userId: user.id };

    const [rows, total] = await Promise.all([
      prisma.messageThread.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { body: true, senderRole: true, createdAt: true },
          },
        },
      }),
      prisma.messageThread.count({ where }),
    ]);

    const threads = rows.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      contextType: t.contextType,
      contextId: t.contextId,
      lastMessageAt: t.lastMessageAt,
      userUnread: t.userUnread,
      createdAt: t.createdAt,
      lastMessage: t.messages[0] ?? null,
    }));

    return NextResponse.json({ threads, total, limit, offset });
  } catch (error) {
    console.error("GET /api/messages/threads error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/messages/threads — "Ask about this": start a thread from one of
// the caller's notifications. { notificationId, body }
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw = await req.json();
    const { notificationId } = raw as { notificationId?: unknown };
    const messageBody =
      typeof raw.body === "string" ? (raw.body as string).trim() : "";

    if (!notificationId || typeof notificationId !== "string") {
      return NextResponse.json(
        { error: "notificationId required" },
        { status: 400 }
      );
    }
    if (messageBody.length < 1 || messageBody.length > 5000) {
      return NextResponse.json(
        { error: "Message must be between 1 and 5000 characters" },
        { status: 400 }
      );
    }

    const rl = await rateLimit(`msg-create:${user.id}`, {
      limit: 5,
      windowSec: 60,
    });
    if (!rl.success) return tooManyRequests();

    // Scoped to the caller — a foreign notification id 404s, never leaks.
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId: user.id },
    });

    if (!notification) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    // Already asked about this one → hand back the existing conversation.
    if (notification.threadId) {
      const existing = await prisma.messageThread.findUnique({
        where: { id: notification.threadId },
      });
      if (existing) {
        return NextResponse.json({ thread: existing, existing: true });
      }
    }

    const now = new Date();

    try {
      const thread = await prisma.$transaction(async (tx) => {
        const created = await tx.messageThread.create({
          data: {
            userId: user.id,
            createdById: user.id,
            subject: notification.title.slice(0, 200),
            contextType:
              notification.contextType ??
              (notification.broadcastId ? "Broadcast" : null),
            contextId: notification.contextId ?? notification.broadcastId,
            staffUnread: true,
            lastMessageAt: now,
          },
        });

        await tx.message.create({
          data: {
            threadId: created.id,
            senderId: user.id,
            senderRole: "USER",
            body: messageBody,
          },
        });

        // Race-safe claim: only wins if nobody has linked a thread yet.
        const claimed = await tx.notification.updateMany({
          where: { id: notification.id, userId: user.id, threadId: null },
          data: { threadId: created.id },
        });
        if (claimed.count === 0) {
          throw new Error(CLAIM_LOST); // rolls back thread + message
        }

        return created;
      });

      return NextResponse.json({ thread }, { status: 201 });
    } catch (txError) {
      if (!(txError instanceof Error) || txError.message !== CLAIM_LOST) {
        throw txError;
      }
      // A concurrent request won the claim — return the thread it created.
      const reloaded = await prisma.notification.findFirst({
        where: { id: notification.id, userId: user.id },
        select: { threadId: true },
      });
      const existing = reloaded?.threadId
        ? await prisma.messageThread.findUnique({
            where: { id: reloaded.threadId },
          })
        : null;
      if (!existing) throw txError;
      return NextResponse.json({ thread: existing, existing: true });
    }
  } catch (error) {
    console.error("POST /api/messages/threads error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
