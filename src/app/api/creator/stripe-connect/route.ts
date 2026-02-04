import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";

// GET /api/creator/stripe-connect — check Stripe Connect onboarding status
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true, stripeConnectId: true },
    });

    if (!dbUser || (dbUser.role !== "CREATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Creator access required" },
        { status: 403 }
      );
    }

    // No Connect account yet
    if (!dbUser.stripeConnectId) {
      return NextResponse.json({
        connected: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        accountId: null,
      });
    }

    // Check account status with Stripe
    const account = await stripe.accounts.retrieve(dbUser.stripeConnectId);

    return NextResponse.json({
      connected: true,
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      accountId: account.id,
      detailsSubmitted: account.details_submitted ?? false,
    });
  } catch (error) {
    console.error("GET /api/creator/stripe-connect error:", error);
    return NextResponse.json(
      { error: "Failed to check Stripe Connect status" },
      { status: 500 }
    );
  }
}

// POST /api/creator/stripe-connect — create Connect account + return onboarding link
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true, email: true, stripeConnectId: true },
    });

    if (!dbUser || (dbUser.role !== "CREATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json(
        { error: "Creator access required" },
        { status: 403 }
      );
    }

    let accountId = dbUser.stripeConnectId;

    // Create a new Express account if one doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: dbUser.email,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          userId: authUser.id,
        },
      });

      accountId = account.id;

      // Store the Connect account ID
      await prisma.user.update({
        where: { id: authUser.id },
        data: { stripeConnectId: accountId },
      });
    }

    // Determine return URL from request origin
    const origin =
      request.headers.get("origin") ||
      request.headers.get("referer")?.replace(/\/[^/]*$/, "") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://greenroom-v2.vercel.app";

    // Create an Account Link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/creator/earnings`,
      return_url: `${origin}/creator/earnings`,
      type: "account_onboarding",
    });

    return NextResponse.json({
      url: accountLink.url,
      accountId,
    });
  } catch (error: unknown) {
    console.error("POST /api/creator/stripe-connect error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to create Stripe Connect onboarding link: ${message}` },
      { status: 500 }
    );
  }
}
