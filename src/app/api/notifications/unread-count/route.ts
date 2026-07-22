import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// GET /api/notifications/unread-count — cheap poll target for the bell badge.
// Deliberately NOT part of /api/user/me (too heavy to poll — it runs provisioning).
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [notifications, threads] = await Promise.all([
      prisma.notification.count({
        where: { userId: user.id, readAt: null },
      }),
      prisma.messageThread.count({
        where: { userId: user.id, userUnread: true },
      }),
    ]);

    return NextResponse.json({
      notifications,
      threads,
      total: notifications + threads,
    });
  } catch (error) {
    console.error("GET /api/notifications/unread-count error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
