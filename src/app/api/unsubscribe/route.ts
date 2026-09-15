import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/email";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";
import { resolveUnsubscribeLink } from "@/lib/unsubscribeToken";

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

const LINK_ERRORS = {
  missing: "Unsubscribe token required",
  invalid: "Invalid unsubscribe link",
  expired: "This unsubscribe link has expired",
} as const;

function stringField(body: unknown, key: string): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
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

    // The token arrives as JSON ({ token }) from our /unsubscribe page, or on
    // the query string for RFC 8058 one-click POSTs, whose body is the opaque
    // form string "List-Unsubscribe=One-Click". Emails sent before tokens
    // carry ?email= instead, which resolveUnsubscribeLink accepts until its
    // legacy cutoff.
    let body: unknown = null;
    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      body = await request.json().catch(() => null);
    }
    const query = request.nextUrl.searchParams;
    const link = resolveUnsubscribeLink({
      token: stringField(body, "token") ?? query.get("token"),
      email: stringField(body, "email") ?? query.get("email"),
    });
    if (!link.ok) {
      return NextResponse.json({ error: LINK_ERRORS[link.reason] }, { status: 400 });
    }

    await processUnsubscribe(link.email);

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
// client), so GET just forwards to the confirmation page. It forwards only a
// token (a valid one as-is, a legacy ?email= re-issued as one), so the address
// never lands in the page URL the trackers record; anything else arrives at
// the page's invalid-link state.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const link = resolveUnsubscribeLink({
    token: query.get("token"),
    email: query.get("email"),
  });
  const url = new URL("/unsubscribe", request.url);
  if (link.ok) url.searchParams.set("token", link.token);
  return NextResponse.redirect(url);
}
