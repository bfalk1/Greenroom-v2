import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Update user's email preferences if they exist
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (user) {
      // Store unsubscribe preference in metadata or a dedicated field
      // For now, we'll just log it - you may want to add an emailOptOut field to the User model
      console.log(`[Unsubscribe] User ${email} unsubscribed from marketing emails`);
      
      // If you add an emailOptOut field later:
      // await prisma.user.update({
      //   where: { email },
      //   data: { emailOptOut: true },
      // });
    }

    // Also check creator invites - mark as opted out
    await prisma.creatorInvite.updateMany({
      where: { email },
      data: { emailStatus: "opted_out" },
    });

    console.log(`[Unsubscribe] ${email} unsubscribed`);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Unsubscribe] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Support GET for one-click unsubscribe (List-Unsubscribe header)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Process unsubscribe
  try {
    await prisma.creatorInvite.updateMany({
      where: { email },
      data: { emailStatus: "opted_out" },
    });
    console.log(`[Unsubscribe] ${email} one-click unsubscribed`);
  } catch (error) {
    console.error("[Unsubscribe] Error:", error);
  }

  // Redirect to confirmation page
  return NextResponse.redirect(new URL(`/unsubscribe?email=${encodeURIComponent(email)}&done=1`, request.url));
}
