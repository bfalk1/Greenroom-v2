import { NextRequest, NextResponse } from "next/server";
import { sendContactEmail } from "@/lib/email";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";

export async function POST(request: NextRequest) {
  try {
    // Unauthenticated and sends an email per request — cap per IP to prevent
    // inbox flooding / Resend quota & reputation abuse.
    const rl = await rateLimit(`contact:${clientIp(request)}`, {
      limit: 5,
      windowSec: 60,
    });
    if (!rl.success) return tooManyRequests();

    const body = await request.json();
    const { name, email, message } = body as {
      name: string;
      email: string;
      message: string;
    };

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email, and message are required" },
        { status: 400 }
      );
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    await sendContactEmail(name, email, message);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "Failed to send message. Please try again later." },
      { status: 500 }
    );
  }
}
