import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";

// Add contact to Resend
async function addToResendAudience(email: string) {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    console.log("[Waitlist] RESEND_API_KEY not set, skipping");
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.contacts.create({
      email,
    });
    console.log("[Waitlist] Added to Resend:", email, result);
  } catch (error) {
    console.error("[Waitlist] Resend error:", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Unauthenticated write + Resend call per request — cap per IP.
    const rl = await rateLimit(`waitlist:${clientIp(request)}`, {
      limit: 5,
      windowSec: 60,
    });
    if (!rl.success) return tooManyRequests();

    const body = await request.json();
    const { email } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if already on waitlist
    const existing = await prisma.waitlistEntry.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: "You're already on the waitlist!" },
        { status: 400 }
      );
    }

    // Add to waitlist DB
    await prisma.waitlistEntry.create({
      data: {
        email: normalizedEmail,
      },
    });

    // Add to Resend audience
    await addToResendAudience(normalizedEmail);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Waitlist error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

// GET - Admin endpoint to list waitlist entries (PII). Gated by the same
// session + role model as every other admin route — never a URL query-string
// secret, which leaks via logs/Referer/history.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (!dbUser || (dbUser.role !== "ADMIN" && dbUser.role !== "MODERATOR")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const entries = await prisma.waitlistEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  return NextResponse.json({
    count: entries.length,
    entries,
  });
}
