import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// GET /api/mod/inbox/unread-count — staff-unread thread count (MODERATOR/ADMIN)
export async function GET() {
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

    if (!dbUser || (dbUser.role !== "MODERATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const threads = await prisma.messageThread.count({
      where: { staffUnread: true },
    });

    return NextResponse.json({ threads });
  } catch (error) {
    console.error("GET /api/mod/inbox/unread-count error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
