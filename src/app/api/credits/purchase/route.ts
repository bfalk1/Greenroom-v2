import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { NextResponse } from "next/server";

// Map price IDs to credit amounts
const CREDIT_PACKS: Record<string, number> = {
  "price_1Sx9xM5k6Fwn7Cbz15vCSHwt": 50,
  "price_1Sx9xi5k6Fwn7CbzioLNev9W": 150,
  "price_1Sx9y35k6Fwn7CbzGeA0QXz1": 400,
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { priceId } = await request.json();

    if (!priceId || !CREDIT_PACKS[priceId]) {
      return NextResponse.json(
        { error: "Invalid credit pack" },
        { status: 400 }
      );
    }

    const credits = CREDIT_PACKS[priceId];

    // Get or create Stripe customer
    let user = await prisma.user.findUnique({
      where: { id: authUser.id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      stripeCustomerId = customer.id;

      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId },
      });
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://greenroom-v2.vercel.app";

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId: user.id,
        type: "credit_purchase",
        credits: credits.toString(),
      },
      success_url: `${appUrl}/account?credits_purchased=true`,
      cancel_url: `${appUrl}/account?credits_canceled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Error creating credit purchase checkout:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
