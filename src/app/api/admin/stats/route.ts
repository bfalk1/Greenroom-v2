import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// GET /api/admin/stats — platform-wide stats (MODERATOR/ADMIN only)
export async function GET() {
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

  const [
    totalUsers,
    totalCreators,
    totalSamples,
    publishedSamples,
    totalPurchases,
    pendingApplications,
    pendingSamples,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "CREATOR" } }),
    prisma.sample.count(),
    prisma.sample.count({ where: { status: "PUBLISHED" } }),
    prisma.purchase.count(),
    prisma.creatorApplication.count({ where: { status: "PENDING" } }),
    prisma.sample.count({
      where: { status: { in: ["DRAFT", "REVIEW"] } },
    }),
  ]);

  return NextResponse.json({
    totalUsers,
    totalCreators,
    totalSamples,
    publishedSamples,
    totalPurchases,
    pendingApplications,
    pendingSamples,
  });
}
