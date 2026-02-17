import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe/client";
import { calculateCreatorEarningsCents } from "@/lib/payouts";

// Cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

// POST /api/cron/payouts — Run automatic monthly payouts (called by Vercel Cron)
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    // Get all creators with Stripe Connect
    const creators = await prisma.user.findMany({
      where: {
        role: "CREATOR",
        stripeConnectId: { not: null },
      },
      select: {
        id: true,
        email: true,
        artistName: true,
        stripeConnectId: true,
        payoutRate: true,
      },
    });

    const results: { creatorId: string; status: string; amount?: number; error?: string }[] = [];

    for (const creator of creators) {
      try {
        // Get all samples by this creator
        const creatorSamples = await prisma.sample.findMany({
          where: { creatorId: creator.id },
          select: { id: true },
        });
        const sampleIds = creatorSamples.map((s) => s.id);

        if (sampleIds.length === 0) {
          results.push({ creatorId: creator.id, status: "skipped", error: "No samples" });
          continue;
        }

        // Get purchases in this period that haven't been paid out
        const purchases = await prisma.purchase.findMany({
          where: {
            sampleId: { in: sampleIds },
            createdAt: {
              gte: periodStart,
              lt: periodEnd,
            },
          },
          select: { creditsSpent: true },
        });

        const totalCredits = purchases.reduce((sum, p) => sum + p.creditsSpent, 0);

        if (totalCredits === 0) {
          results.push({ creatorId: creator.id, status: "skipped", error: "No earnings" });
          continue;
        }

        // Calculate earnings
        const amountCents = await calculateCreatorEarningsCents(creator.id, totalCredits);

        // Minimum payout threshold: $5
        if (amountCents < 500) {
          results.push({ 
            creatorId: creator.id, 
            status: "skipped", 
            amount: amountCents,
            error: `Below $5 minimum (${(amountCents / 100).toFixed(2)})` 
          });
          continue;
        }

        // Check if payout already exists for this period
        const existingPayout = await prisma.creatorPayout.findFirst({
          where: {
            creatorId: creator.id,
            periodStart,
            periodEnd,
          },
        });

        if (existingPayout) {
          results.push({ creatorId: creator.id, status: "skipped", error: "Already processed" });
          continue;
        }

        // Create Stripe transfer
        const stripe = getStripe();
        let stripeTransferId: string | null = null;

        try {
          const transfer = await stripe.transfers.create({
            amount: amountCents,
            currency: "usd",
            destination: creator.stripeConnectId!,
            description: `Greenroom payout ${periodStart.toISOString().split("T")[0]} to ${periodEnd.toISOString().split("T")[0]}`,
          });
          stripeTransferId = transfer.id;
        } catch (stripeError) {
          console.error(`Stripe transfer failed for ${creator.id}:`, stripeError);
          
          // Create pending payout record
          await prisma.creatorPayout.create({
            data: {
              creatorId: creator.id,
              periodStart,
              periodEnd,
              totalCreditsSpent: totalCredits,
              amountUsdCents: amountCents,
              status: "FAILED",
            },
          });

          results.push({ 
            creatorId: creator.id, 
            status: "failed", 
            amount: amountCents,
            error: "Stripe transfer failed" 
          });
          continue;
        }

        // Create payout record
        await prisma.creatorPayout.create({
          data: {
            creatorId: creator.id,
            periodStart,
            periodEnd,
            totalCreditsSpent: totalCredits,
            amountUsdCents: amountCents,
            status: "PAID",
            stripeTransferId,
            paidAt: new Date(),
          },
        });

        results.push({ 
          creatorId: creator.id, 
          status: "paid", 
          amount: amountCents 
        });

      } catch (error) {
        console.error(`Payout error for ${creator.id}:`, error);
        results.push({ 
          creatorId: creator.id, 
          status: "error", 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }

    const paid = results.filter(r => r.status === "paid");
    const totalPaid = paid.reduce((sum, r) => sum + (r.amount || 0), 0);

    return NextResponse.json({
      success: true,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      processed: creators.length,
      paid: paid.length,
      totalPaidCents: totalPaid,
      results,
    });
  } catch (error) {
    console.error("Cron payout error:", error);
    return NextResponse.json({ error: "Payout job failed" }, { status: 500 });
  }
}

// GET for health check
export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "monthly-payouts" });
}
