import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// GET /api/admin/broadcasts/audience — how many creators a broadcast would reach (ADMIN)
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

    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const count = await prisma.user.count({
      where: { role: "CREATOR", isActive: true },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error("GET /api/admin/broadcasts/audience error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
