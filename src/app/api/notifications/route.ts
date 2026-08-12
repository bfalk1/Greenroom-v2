import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// GET /api/notifications — the caller's notifications, newest-first
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
    const filter = searchParams.get("filter");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20") || 20, 50);
    const offset = Math.max(
      0,
      Math.min(parseInt(searchParams.get("offset") || "0") || 0, 10000)
    );

    const where = {
      userId: user.id,
      ...(filter === "unread" ? { readAt: null } : {}),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          contextType: true,
          contextId: true,
          metadata: true,
          broadcastId: true,
          threadId: true,
          readAt: true,
          createdAt: true,
          broadcast: { select: { subject: true, body: true } },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    return NextResponse.json({ notifications, total, limit, offset });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
