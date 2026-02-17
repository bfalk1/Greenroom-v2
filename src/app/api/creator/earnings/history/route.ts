import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getCreatorEarningsInfo } from "@/lib/payouts";

// GET /api/creator/earnings/history?period=day|week|month
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });

    if (!dbUser || (dbUser.role !== "CREATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json({ error: "Creator access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "day";

    // Get creator's payout rate
    const earningsInfo = await getCreatorEarningsInfo(authUser.id);
    const centsPerCredit = earningsInfo.centsPerCredit;

    // Get all sample IDs for this creator
    const creatorSamples = await prisma.sample.findMany({
      where: { creatorId: authUser.id },
      select: { id: true },
    });
    const sampleIds = creatorSamples.map((s) => s.id);

    if (sampleIds.length === 0) {
      return NextResponse.json({ history: [], period });
    }

    // Get all purchases for the last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const purchases = await prisma.purchase.findMany({
      where: {
        sampleId: { in: sampleIds },
        createdAt: { gte: twelveMonthsAgo },
      },
      select: {
        createdAt: true,
        creditsSpent: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Aggregate by period
    const aggregated: Record<string, { credits: number; earnings: number; count: number }> = {};

    purchases.forEach((p) => {
      let key: string;
      const date = new Date(p.createdAt);

      if (period === "day") {
        key = date.toISOString().split("T")[0]; // YYYY-MM-DD
      } else if (period === "week") {
        // Get Monday of the week
        const monday = new Date(date);
        monday.setDate(date.getDate() - date.getDay() + 1);
        key = monday.toISOString().split("T")[0];
      } else {
        // month
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      }

      if (!aggregated[key]) {
        aggregated[key] = { credits: 0, earnings: 0, count: 0 };
      }
      aggregated[key].credits += p.creditsSpent;
      aggregated[key].earnings += (p.creditsSpent * centsPerCredit) / 100;
      aggregated[key].count += 1;
    });

    // Convert to array and sort
    const history = Object.entries(aggregated)
      .map(([date, data]) => ({
        date,
        credits: data.credits,
        earnings: Math.round(data.earnings * 100) / 100,
        sales: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Fill in missing periods for smoother charts
    const filledHistory: typeof history = [];
    if (history.length > 0) {
      const startDate = new Date(history[0].date);
      const endDate = new Date();
      const current = new Date(startDate);

      while (current <= endDate) {
        let key: string;
        if (period === "day") {
          key = current.toISOString().split("T")[0];
          current.setDate(current.getDate() + 1);
        } else if (period === "week") {
          key = current.toISOString().split("T")[0];
          current.setDate(current.getDate() + 7);
        } else {
          key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
          current.setMonth(current.getMonth() + 1);
        }

        const existing = history.find((h) => h.date === key);
        filledHistory.push(existing || { date: key, credits: 0, earnings: 0, sales: 0 });
      }
    }

    return NextResponse.json({ 
      history: filledHistory.slice(-30), // Last 30 data points
      period,
      centsPerCredit,
    });
  } catch (error) {
    console.error("GET /api/creator/earnings/history error:", error);
    return NextResponse.json({ error: "Failed to fetch earnings history" }, { status: 500 });
  }
}
