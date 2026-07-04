import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { createPaypalOrder, isPaypalConfigured } from "@/lib/paypal/client";
import { PUBLIC_CREDIT_PACKAGES } from "@/lib/stripe/publicPriceConfig";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  try {
    if (!isPaypalConfigured()) {
      return NextResponse.json(
        { error: "PayPal is not available" },
        { status: 503 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Each call creates a PayPal API order and a paypal_orders row — bound it.
    const limit = await rateLimit(`paypal-order:${authUser.id}`, {
      limit: 10,
      windowSec: 60,
    });
    if (!limit.success) {
      return tooManyRequests();
    }

    const { credits } = await request.json();

    // Packs are keyed by credit count; the price always comes from our
    // config, never from the client.
    const pack = PUBLIC_CREDIT_PACKAGES.find((p) => p.credits === credits);

    if (!pack) {
      return NextResponse.json(
        { error: "Invalid credit pack" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const amountUsdCents = Math.round(pack.price * 100);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://greenroom.fm";

    const order = await createPaypalOrder({
      amountUsdCents,
      description: `${pack.credits} Greenroom credits`,
      userId: user.id,
      returnUrl: `${appUrl}/api/credits/purchase-paypal/return`,
      cancelUrl: `${appUrl}/account?credits_canceled=true`,
      requestId: randomUUID(),
    });

    if (!order.approveUrl) {
      console.error(`PayPal order ${order.id} has no approve link`);
      return NextResponse.json(
        { error: "Failed to create PayPal checkout" },
        { status: 500 }
      );
    }

    // Record the quote before redirecting — settlement verifies the captured
    // amount against this row and grants exactly once.
    await prisma.paypalOrder.create({
      data: {
        id: order.id,
        userId: user.id,
        credits: pack.credits,
        amountUsdCents,
      },
    });

    return NextResponse.json({ url: order.approveUrl });
  } catch (error) {
    console.error("Error creating PayPal credit purchase:", error);
    return NextResponse.json(
      { error: "Failed to create PayPal checkout" },
      { status: 500 }
    );
  }
}
