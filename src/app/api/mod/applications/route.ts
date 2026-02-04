import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// GET /api/mod/applications — list all creator applications (MODERATOR/ADMIN only)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check role
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (!dbUser || (dbUser.role !== "MODERATOR" && dbUser.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Optional status filter
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (statusFilter && ["PENDING", "APPROVED", "DENIED"].includes(statusFilter)) {
    where.status = statusFilter;
  }

  const applications = await prisma.creatorApplication.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          avatarUrl: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });

  return NextResponse.json({ applications });
}
