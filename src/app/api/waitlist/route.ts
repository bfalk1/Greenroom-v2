import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Add contact to Resend audience via REST API
async function addToResendAudience(email: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  
  if (!apiKey) {
    console.log("[Waitlist] RESEND_API_KEY not set, skipping audience add");
    return;
  }

  if (!audienceId) {
    console.log("[Waitlist] RESEND_AUDIENCE_ID not set, skipping audience add");
    return;
  }

  try {
    const response = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        unsubscribed: false,
      }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error("[Waitlist] Resend API error:", result);
      return;
    }

    console.log("[Waitlist] Added to Resend audience:", email, result);
  } catch (error) {
    console.error("[Waitlist] Failed to add to Resend audience:", error);
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
