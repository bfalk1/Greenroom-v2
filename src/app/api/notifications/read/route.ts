import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// POST /api/notifications/read — mark notifications read: { ids?: string[], all?: true }
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { ids, all } = body as { ids?: unknown; all?: unknown };

    const validIds =
      Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === "string")
        ? (ids as string[])
        : null;

    if (all !== true && !validIds) {
      return NextResponse.json(
        { error: "Provide ids (non-empty string array) or all: true" },
        { status: 400 }
      );
    }

    // Ownership enforced via userId in the where clause — foreign ids are no-ops.
    const result = await prisma.notification.updateMany({
      where: {
        userId: user.id,
        readAt: null,
        ...(all === true ? {} : { id: { in: validIds! } }),
      },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error("POST /api/notifications/read error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
