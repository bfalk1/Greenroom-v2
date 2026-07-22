import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { sendBroadcastAlertEmailSafe } from "@/lib/notifications";

// The post-commit email loop is paced at ~600ms per recipient (Resend's
// default limit is 2 req/s), so a large audience needs a long function budget.
export const maxDuration = 300;

const NOTIFICATION_CHUNK = 1000;
const EMAIL_SPACING_MS = 600;

// POST /api/admin/broadcasts — send an announcement to all approved creators (ADMIN)
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

    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const raw = await req.json();
    const subject = typeof raw?.subject === "string" ? raw.subject.trim() : "";
    const body = typeof raw?.body === "string" ? raw.body.trim() : "";

    if (subject.length < 1 || subject.length > 200) {
      return NextResponse.json(
        { error: "Subject must be 1-200 characters" },
        { status: 400 }
      );
    }
    if (body.length < 1 || body.length > 10000) {
      return NextResponse.json(
        { error: "Body must be 1-10000 characters" },
        { status: 400 }
      );
    }

    const rl = await rateLimit(`broadcast:${dbUser.id}`, {
      limit: 3,
      windowSec: 60,
    });
    if (!rl.success) {
      return tooManyRequests();
    }

    const recipients = await prisma.user.findMany({
      where: { role: "CREATOR", isActive: true },
      select: { id: true, email: true },
    });

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "No approved creators to send to" },
        { status: 400 }
      );
    }

    const broadcast = await prisma.$transaction(
      async (tx) => {
        const created = await tx.broadcast.create({
          data: {
            authorId: dbUser.id,
            subject,
            body,
            recipientCount: recipients.length,
          },
        });

        for (let i = 0; i < recipients.length; i += NOTIFICATION_CHUNK) {
          const chunk = recipients.slice(i, i + NOTIFICATION_CHUNK);
          await tx.notification.createMany({
            data: chunk.map((recipient) => ({
              userId: recipient.id,
              type: "BROADCAST" as const,
              title: subject.slice(0, 200),
              broadcastId: created.id,
            })),
          });
        }

        await tx.auditLog.create({
          data: {
            actorId: dbUser.id,
            action: "BROADCAST_SENT",
            targetType: "Broadcast",
            targetId: created.id,
            metadata: { recipientCount: recipients.length, subject },
          },
        });

        return created;
      },
      { timeout: 30000 }
    );

    // After commit: paced sequential email fan-out. Failures never undo the
    // in-app notifications — they're reported back as emailErrors.
    let emailed = 0;
    let emailErrors = 0;
    for (let i = 0; i < recipients.length; i++) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, EMAIL_SPACING_MS));
      }
      const ok = await sendBroadcastAlertEmailSafe(recipients[i].email);
      if (ok) {
        emailed++;
      } else {
        emailErrors++;
      }
    }

    return NextResponse.json(
      { broadcast, delivered: recipients.length, emailed, emailErrors },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/admin/broadcasts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/admin/broadcasts — past broadcasts with read counts (ADMIN)
export async function GET(req: NextRequest) {
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
      select: { role: true },
    });

    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20") || 20, 50);
    const offset = Math.max(
      0,
      Math.min(parseInt(searchParams.get("offset") || "0") || 0, 10000)
    );

    const [broadcasts, total] = await Promise.all([
      prisma.broadcast.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          subject: true,
          body: true,
          recipientCount: true,
          createdAt: true,
        },
      }),
      prisma.broadcast.count(),
    ]);

    const readCounts = new Map<string, number>();
    if (broadcasts.length > 0) {
      const grouped = await prisma.notification.groupBy({
        by: ["broadcastId"],
        where: {
          broadcastId: { in: broadcasts.map((b) => b.id) },
          readAt: { not: null },
        },
        _count: true,
      });
      for (const row of grouped) {
        if (row.broadcastId) readCounts.set(row.broadcastId, row._count);
      }
    }

    return NextResponse.json({
      broadcasts: broadcasts.map((b) => ({
        ...b,
        readCount: readCounts.get(b.id) ?? 0,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("GET /api/admin/broadcasts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
