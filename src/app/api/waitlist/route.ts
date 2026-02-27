import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

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

// GET - Admin endpoint to list waitlist entries
export async function GET(request: NextRequest) {
  // Simple auth check - you might want to add proper admin auth
  const { searchParams } = new URL(request.url);
  const adminKey = searchParams.get("key");
  
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.waitlistEntry.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ 
    count: entries.length,
    entries 
  });
}
