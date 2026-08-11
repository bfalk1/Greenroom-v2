import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { normalizeEmail } from "@/lib/email";

// Where a creator's money goes. Payouts are sent by hand over PayPal, so this
// address is the only routing information the platform holds — every payout
// path (request, monthly cron, admin approval) refuses to move on without it.
//
// GET  /api/creator/payout-method — read the address on file
// PUT  /api/creator/payout-method — set or change it

// Deliberately loose: PayPal accounts live on every TLD imaginable, so this only
// rejects input that could not be an address at all. A typo'd but well-formed
// address is caught by the creator reading it back on the earnings page.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

async function requireCreator() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { role: true },
  });

  if (!dbUser || (dbUser.role !== "CREATOR" && dbUser.role !== "ADMIN")) {
    return {
      error: NextResponse.json(
        { error: "Creator access required" },
        { status: 403 }
      ),
    };
  }

  return { userId: authUser.id };
}

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.error) return auth.error;

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { paypalEmail: true },
    });

    return NextResponse.json({ paypalEmail: user?.paypalEmail ?? null });
  } catch (error) {
    console.error("GET /api/creator/payout-method error:", error);
    return NextResponse.json(
      { error: "Failed to load payout method" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const raw = (body as { paypalEmail?: unknown }).paypalEmail;

    if (typeof raw !== "string" || raw.trim() === "") {
      return NextResponse.json(
        { error: "Enter the PayPal email address you want payouts sent to." },
        { status: 400 }
      );
    }

    const paypalEmail = normalizeEmail(raw);

    if (paypalEmail.length > 254 || !EMAIL_SHAPE.test(paypalEmail)) {
      return NextResponse.json(
        { error: "That doesn't look like a valid email address." },
        { status: 400 }
      );
    }

    const before = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { paypalEmail: true },
    });

    const user = await prisma.user.update({
      where: { id: auth.userId },
      data: { paypalEmail },
      select: { paypalEmail: true },
    });

    // Changing where money is sent is worth an audit trail — it's the field an
    // account takeover would target.
    if (before?.paypalEmail !== user.paypalEmail) {
      await prisma.auditLog.create({
        data: {
          actorId: auth.userId,
          action: "PAYOUT_METHOD_UPDATED",
          targetType: "User",
          targetId: auth.userId,
          metadata: {
            previousPaypalEmail: before?.paypalEmail ?? null,
            paypalEmail: user.paypalEmail,
          },
        },
      });
    }

    return NextResponse.json({ paypalEmail: user.paypalEmail });
  } catch (error) {
    console.error("PUT /api/creator/payout-method error:", error);
    return NextResponse.json(
      { error: "Failed to save payout method" },
      { status: 500 }
    );
  }
}
