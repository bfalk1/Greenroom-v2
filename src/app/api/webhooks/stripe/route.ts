import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  // TODO: Verify webhook signature and handle events
  // - checkout.session.completed
  // - invoice.paid
  // - customer.subscription.updated
  // - customer.subscription.deleted
  // - invoice.payment_failed

  return NextResponse.json({ received: true });
}
