import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/admin/export?type=revenue|downloads|users|payouts|transactions&from=&to=
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });

    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "revenue";
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) dateFilter.lte = new Date(toDate);

    let csv = "";
    let filename = "";

    switch (type) {
      case "revenue": {
        // Credit purchases and subscription payments
        const purchases = await prisma.creditTransaction.findMany({
          where: {
            type: "PURCHASE",
            ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
          },
          include: {
            user: { select: { email: true, username: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        csv = "Date,User Email,Username,Credits,Amount (cents),Type\n";
        purchases.forEach((p) => {
          csv += `${p.createdAt.toISOString()},${p.user.email || ""},${p.user.username || ""},${p.amount},${Math.abs(p.amount) * 10},CREDIT_PURCHASE\n`;
        });

        // Add subscription revenue if available
        const subscriptions = await prisma.subscription.findMany({
          where: {
            status: "ACTIVE",
            ...(Object.keys(dateFilter).length > 0 && { currentPeriodStart: dateFilter }),
          },
          include: {
            user: { select: { email: true, username: true } },
            tier: { select: { name: true, priceUsdCents: true } },
          },
        });

        subscriptions.forEach((s) => {
          const tierName = s.tier?.name || "unknown";
          const amount = s.tier?.priceUsdCents || 0;
          csv += `${s.currentPeriodStart?.toISOString() || ""},${s.user.email || ""},${s.user.username || ""},0,${amount},SUBSCRIPTION_${tierName.toUpperCase()}\n`;
        });

        filename = `greenroom_revenue_${new Date().toISOString().split("T")[0]}.csv`;
        break;
      }

      case "downloads": {
        const downloads = await prisma.purchase.findMany({
          where: Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {},
          include: {
            user: { select: { email: true, username: true } },
            sample: { 
              select: { 
                name: true, 
                creditPrice: true,
                creator: { select: { artistName: true, username: true } },
              } 
            },
          },
          orderBy: { createdAt: "desc" },
        });

        csv = "Date,User Email,Username,Sample Name,Creator,Credits Spent\n";
        downloads.forEach((d) => {
          csv += `${d.createdAt.toISOString()},${d.user.email || ""},${d.user.username || ""},${d.sample.name},${d.sample.creator.artistName || d.sample.creator.username},${d.creditsSpent}\n`;
        });

        filename = `greenroom_downloads_${new Date().toISOString().split("T")[0]}.csv`;
        break;
      }

      case "users": {
        const users = await prisma.user.findMany({
          where: Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {},
          select: {
            email: true,
            username: true,
            role: true,
            credits: true,
            createdAt: true,
            _count: { select: { purchases: true, samples: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        csv = "Joined,Email,Username,Role,Credits,Purchases,Samples Uploaded\n";
        users.forEach((u) => {
          csv += `${u.createdAt.toISOString()},${u.email || ""},${u.username || ""},${u.role},${u.credits},${u._count.purchases},${u._count.samples}\n`;
        });

        filename = `greenroom_users_${new Date().toISOString().split("T")[0]}.csv`;
        break;
      }

      case "payouts": {
        const payouts = await prisma.creatorPayout.findMany({
          where: Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {},
          include: {
            creator: { select: { email: true, artistName: true, username: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        csv = "Date,Creator Email,Artist Name,Credits Spent,Amount (cents),Status,Stripe Transfer ID\n";
        payouts.forEach((p) => {
          csv += `${p.createdAt.toISOString()},${p.creator.email || ""},${p.creator.artistName || p.creator.username},${p.totalCreditsSpent},${p.amountUsdCents},${p.status},${p.stripeTransferId || ""}\n`;
        });

        filename = `greenroom_payouts_${new Date().toISOString().split("T")[0]}.csv`;
        break;
      }

      case "transactions": {
        const transactions = await prisma.creditTransaction.findMany({
          where: Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {},
          include: {
            user: { select: { email: true, username: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        csv = "Date,User Email,Username,Type,Amount,Note\n";
        transactions.forEach((t) => {
          csv += `${t.createdAt.toISOString()},${t.user.email || ""},${t.user.username || ""},${t.type},${t.amount},${t.note || ""}\n`;
        });

        filename = `greenroom_transactions_${new Date().toISOString().split("T")[0]}.csv`;
        break;
      }

      case "samples": {
        const samples = await prisma.sample.findMany({
          where: Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {},
          include: {
            creator: { select: { artistName: true, username: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        csv = "Date,Name,Creator,Genre,Type,Key,BPM,Credits,Downloads,Rating,Status\n";
        samples.forEach((s) => {
          csv += `${s.createdAt.toISOString()},${s.name},${s.creator.artistName || s.creator.username},${s.genre || ""},${s.sampleType},${s.key || ""},${s.bpm || ""},${s.creditPrice},${s.downloadCount},${s.ratingAvg?.toFixed(2) || ""},${s.status}\n`;
        });

        filename = `greenroom_samples_${new Date().toISOString().split("T")[0]}.csv`;
        break;
      }

      default:
        return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
