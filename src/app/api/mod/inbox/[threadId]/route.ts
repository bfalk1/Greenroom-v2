import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/mod/inbox/[threadId] — open/close a thread (MODERATOR/ADMIN)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;

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

    const body = await req.json();
    const status = body?.status;

    if (status !== "OPEN" && status !== "CLOSED") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await prisma.messageThread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const thread = await prisma.messageThread.update({
      where: { id: threadId },
      data: { status },
    });

    return NextResponse.json({ thread });
  } catch (error) {
    console.error("PATCH /api/mod/inbox/[threadId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
