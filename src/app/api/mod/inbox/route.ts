import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// GET /api/mod/inbox — staff message inbox (MODERATOR/ADMIN)
// ?filter=unread|open|closed|all&search=&limit=&offset=
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

    if (!dbUser || (dbUser.role !== "MODERATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") || "all";
    const search = (searchParams.get("search") || "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") || "20") || 20, 50);
    const offset = Math.max(
      0,
      Math.min(parseInt(searchParams.get("offset") || "0") || 0, 10000)
    );

    const where: Prisma.MessageThreadWhereInput = {};
    if (filter === "unread") {
      where.staffUnread = true;
    } else if (filter === "open") {
      where.status = "OPEN";
    } else if (filter === "closed") {
      where.status = "CLOSED";
    }

    if (search.length >= 2) {
      where.user = {
        OR: [
          { email: { contains: search, mode: "insensitive" } },
          { username: { contains: search, mode: "insensitive" } },
          { artistName: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const [threads, total] = await Promise.all([
      prisma.messageThread.findMany({
        where,
        orderBy: [{ staffUnread: "desc" }, { lastMessageAt: "desc" }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          subject: true,
          status: true,
          contextType: true,
          contextId: true,
          lastMessageAt: true,
          staffUnread: true,
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              artistName: true,
              avatarUrl: true,
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true, senderRole: true, createdAt: true },
          },
        },
      }),
      prisma.messageThread.count({ where }),
    ]);

    return NextResponse.json({
      threads: threads.map(({ messages, ...thread }) => ({
        ...thread,
        lastMessage: messages[0] ?? null,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("GET /api/mod/inbox error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
