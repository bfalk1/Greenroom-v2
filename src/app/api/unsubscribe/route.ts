import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/email";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";

// Records an unsubscribe across every place an email can live, so future
// marketing sends are suppressed. Safe to call for unknown emails.
async function processUnsubscribe(rawEmail: string) {
  const email = normalizeEmail(rawEmail);

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
    // Unauthenticated DB write (the middleware allowlists this route so
    // logged-out recipients can opt out) — cap per IP.
    const rl = await rateLimit(`unsubscribe:${clientIp(request)}`, {
      limit: 5,
      windowSec: 60,
    });
    if (!rl.success) return tooManyRequests();

    // The email arrives as JSON ({ email }) from our /unsubscribe page, or on
    // the query string for RFC 8058 one-click POSTs, whose body is the opaque
    // form string "List-Unsubscribe=One-Click".
    let email: string | null = null;
    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      const body = await request.json().catch(() => null);
      if (body && typeof body.email === "string") email = body.email;
    }
    if (!email) email = request.nextUrl.searchParams.get("email");

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    await processUnsubscribe(email);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Unsubscribe] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// The List-Unsubscribe URL also lands here via GET: legacy mail clients open
// it in a browser, and mail security scanners prefetch it. Neither must
// change state — a prefetch that unsubscribed the recipient would silently
// opt out anyone whose corporate mail gateway follows links. Real opt-outs
// happen only via POST (the page button, or a one-click POST from the mail
// client), so GET just forwards to the confirmation page.
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");
  const url = new URL("/unsubscribe", request.url);
  if (email) url.searchParams.set("email", email);
  return NextResponse.redirect(url);
}
