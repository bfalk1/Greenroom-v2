import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { calculateCreatorEarningsCents } from "@/lib/payouts";
import { 
  sendPayoutNotification, 
  sendPayoutFailedNotification, 
  sendPayoutSummaryToAdmin 
} from "@/lib/email";

// Minimum payout threshold in cents ($50 = 5000 cents)
const MIN_PAYOUT_CENTS = 5000;

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  // If no CRON_SECRET is set, allow in development
  if (!cronSecret && process.env.NODE_ENV === "development") {
    return true;
  }
  
  if (!cronSecret) {
    console.error("CRON_SECRET not configured");
    return false;
  }
  
  return authHeader === `Bearer ${cronSecret}`;
}

// POST /api/cron/monthly-payouts
// Runs on 1st of each month to process automated payouts for creators
export async function POST(request: NextRequest) {
  // Verify authorization
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    processed: 0,
    payoutsCreated: 0,
    payoutsSent: 0,
    totalAmountCents: 0,
    skippedBelowThreshold: 0,
    skippedNoStripe: 0,
    errors: [] as string[],
  };

  try {
    // Calculate period: previous full month
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
    periodEnd.setMilliseconds(-1); // Last moment of previous month
    const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1); // 1st of previous month

    console.log(`Processing payouts for period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

    // Get all creators
    const creators = await prisma.user.findMany({
      where: {
        role: "CREATOR",
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        artistName: true,
        stripeConnectId: true,
      },
    });

    console.log(`Found ${creators.length} active creators`);

    for (const creator of creators) {
      results.processed++;

      try {
        // Get creator's samples
        const creatorSamples = await prisma.sample.findMany({
          where: { creatorId: creator.id },
          select: { id: true },
        });

        const sampleIds = creatorSamples.map((s) => s.id);

        if (sampleIds.length === 0) {
          continue; // No samples, skip
        }

        // Get purchases in the payout period
        const periodPurchases = await prisma.purchase.findMany({
          where: {
            sampleId: { in: sampleIds },
            createdAt: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
          select: { creditsSpent: true },
        });

        const periodCredits = periodPurchases.reduce(
          (sum, p) => sum + p.creditsSpent,
          0
        );

        if (periodCredits === 0) {
          continue; // No earnings this period
        }

        // Calculate earnings for this period
        const periodEarningsCents = await calculateCreatorEarningsCents(
          creator.id,
          periodCredits
        );

        // Check for existing payout for this period (avoid duplicates)
        const existingPayout = await prisma.creatorPayout.findFirst({
          where: {
            creatorId: creator.id,
            periodStart: periodStart,
            periodEnd: periodEnd,
          },
        });

        if (existingPayout) {
          console.log(`Payout already exists for ${creator.email} for this period`);
          continue;
        }

        // Get total unpaid earnings (all time, minus paid payouts)
        const allTimePurchases = await prisma.purchase.findMany({
          where: { sampleId: { in: sampleIds } },
          select: { creditsSpent: true },
        });

        const totalCredits = allTimePurchases.reduce(
          (sum, p) => sum + p.creditsSpent,
          0
        );

        const totalEarningsCents = await calculateCreatorEarningsCents(
          creator.id,
          totalCredits
        );

        const paidPayouts = await prisma.creatorPayout.findMany({
          where: {
            creatorId: creator.id,
            status: "PAID",
          },
          select: { amountUsdCents: true },
        });

        const totalPaidCents = paidPayouts.reduce(
          (sum, p) => sum + p.amountUsdCents,
          0
        );

        const unpaidEarningsCents = totalEarningsCents - totalPaidCents;

        // Check minimum threshold
        if (unpaidEarningsCents < MIN_PAYOUT_CENTS) {
          results.skippedBelowThreshold++;
          console.log(
            `Skipping ${creator.email}: $${(unpaidEarningsCents / 100).toFixed(2)} below $${MIN_PAYOUT_CENTS / 100} threshold`
          );
          continue;
        }

        // Check Stripe Connect status
        if (!creator.stripeConnectId) {
          results.skippedNoStripe++;
          console.log(`Skipping ${creator.email}: No Stripe Connect account`);
          continue;
        }

        // Verify Stripe account is active
        let stripeAccount;
        try {
          stripeAccount = await stripe.accounts.retrieve(creator.stripeConnectId);
        } catch (stripeError) {
          results.skippedNoStripe++;
          console.log(`Skipping ${creator.email}: Stripe account retrieval failed`);
          continue;
        }

        if (!stripeAccount.charges_enabled) {
          results.skippedNoStripe++;
          console.log(`Skipping ${creator.email}: Stripe charges not enabled`);
          continue;
        }

        // Create payout record
        const payout = await prisma.creatorPayout.create({
          data: {
            creatorId: creator.id,
            periodStart: periodStart,
            periodEnd: periodEnd,
            totalCreditsSpent: periodCredits,
            amountUsdCents: unpaidEarningsCents,
            status: "PENDING",
          },
        });

        results.payoutsCreated++;
        console.log(
          `Created payout for ${creator.email}: $${(unpaidEarningsCents / 100).toFixed(2)}`
        );

        // Attempt automatic Stripe transfer
        try {
          const transfer = await stripe.transfers.create({
            amount: unpaidEarningsCents,
            currency: "usd",
            destination: creator.stripeConnectId,
            description: `Greenroom automated payout: ${periodStart.toISOString().split("T")[0]} to ${periodEnd.toISOString().split("T")[0]}`,
            metadata: {
              payoutId: payout.id,
              creatorId: creator.id,
              automated: "true",
            },
          });

          // Update payout as PAID
          await prisma.creatorPayout.update({
            where: { id: payout.id },
            data: {
              status: "PAID",
              paidAt: new Date(),
              stripeTransferId: transfer.id,
            },
          });

          results.payoutsSent++;
          results.totalAmountCents += unpaidEarningsCents;
          console.log(
            `Sent payout to ${creator.email}: $${(unpaidEarningsCents / 100).toFixed(2)} (${transfer.id})`
          );

          // Send email notification to creator
          try {
            await sendPayoutNotification(
              creator.email,
              creator.artistName || creator.email,
              unpaidEarningsCents / 100,
              periodStart,
              periodEnd
            );
          } catch (emailError) {
            console.error(`Failed to send payout email to ${creator.email}:`, emailError);
          }
        } catch (stripeError) {
          // Mark as failed but keep the record
          await prisma.creatorPayout.update({
            where: { id: payout.id },
            data: { status: "FAILED" },
          });

          const errorMsg =
            stripeError instanceof Error ? stripeError.message : "Unknown error";
          results.errors.push(`${creator.email}: Stripe transfer failed - ${errorMsg}`);
          console.error(`Stripe transfer failed for ${creator.email}:`, stripeError);

          // Send failure notification to creator
          try {
            await sendPayoutFailedNotification(
              creator.email,
              creator.artistName || creator.email,
              unpaidEarningsCents / 100,
              errorMsg
            );
          } catch (emailError) {
            console.error(`Failed to send failure email to ${creator.email}:`, emailError);
          }
        }
      } catch (creatorError) {
        const errorMsg =
          creatorError instanceof Error ? creatorError.message : "Unknown error";
        results.errors.push(`${creator.email}: ${errorMsg}`);
        console.error(`Error processing ${creator.email}:`, creatorError);
      }
    }

    console.log("Monthly payout processing complete:", results);

    // Send summary email to admin
    try {
      await sendPayoutSummaryToAdmin({
        processed: results.processed,
        payoutsSent: results.payoutsSent,
        totalAmountUsd: results.totalAmountCents / 100,
        skippedBelowThreshold: results.skippedBelowThreshold,
        skippedNoStripe: results.skippedNoStripe,
        errors: results.errors,
      });
    } catch (emailError) {
      console.error("Failed to send admin summary email:", emailError);
    }

    return NextResponse.json({
      success: true,
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      },
      results: {
        ...results,
        totalAmountUsd: results.totalAmountCents / 100,
      },
    });
  } catch (error) {
    console.error("Monthly payout cron error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        results,
      },
      { status: 500 }
    );
  }
}

// GET endpoint for checking status/testing
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get pending payouts and summary
  const pendingPayouts = await prisma.creatorPayout.findMany({
    where: { status: "PENDING" },
    include: {
      creator: {
        select: { email: true, artistName: true },
      },
    },
  });

  const lastPayout = await prisma.creatorPayout.findFirst({
    where: { status: "PAID" },
    orderBy: { paidAt: "desc" },
  });

  return NextResponse.json({
    minPayoutThreshold: MIN_PAYOUT_CENTS / 100,
    pendingPayouts: pendingPayouts.length,
    lastAutomatedPayout: lastPayout?.paidAt?.toISOString() || null,
    pending: pendingPayouts.map((p) => ({
      id: p.id,
      creator: p.creator.artistName || p.creator.email,
      amount: p.amountUsdCents / 100,
      period: `${p.periodStart.toISOString().split("T")[0]} to ${p.periodEnd.toISOString().split("T")[0]}`,
    })),
  });
}
