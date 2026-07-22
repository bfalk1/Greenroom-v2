import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// GET /api/mod/users/search?q= — recipient picker for staff messaging (MODERATOR/ADMIN)
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
    const q = (searchParams.get("q") || "").trim();

    if (q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } },
          { artistName: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 10,
      select: {
        id: true,
        email: true,
        username: true,
        artistName: true,
        role: true,
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("GET /api/mod/users/search error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
