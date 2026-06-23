import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Records an unsubscribe across every place an email can live, so future
// marketing sends are suppressed. Safe to call for unknown emails.
async function processUnsubscribe(rawEmail: string) {
  const email = rawEmail.toLowerCase().trim();

  // Persist the opt-out on the user. updateMany is a no-op (not an error) if
  // no matching user exists, e.g. a waitlist-only recipient.
  await prisma.user.updateMany({
    where: { email },
    data: { emailOptOutAt: new Date() },
  });

  // Mark any creator invites as opted out so they aren't re-sent.
  await prisma.creatorInvite.updateMany({
    where: { email },
    data: { emailStatus: "opted_out" },
  });

  console.log(`[Unsubscribe] ${email} unsubscribed from marketing email`);
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    await processUnsubscribe(email);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Unsubscribe] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// One-click unsubscribe target for the List-Unsubscribe header.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    await processUnsubscribe(email);
  } catch (error) {
    console.error("[Unsubscribe] Error:", error);
  }

  // Redirect to confirmation page
  return NextResponse.redirect(
    new URL(`/unsubscribe?email=${encodeURIComponent(email)}&done=1`, request.url)
  );
}
