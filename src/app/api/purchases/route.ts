import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// POST /api/purchases — Auth required, purchase a sample
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { sampleId } = body;

    if (!sampleId) {
      return NextResponse.json(
        { error: "sampleId is required" },
        { status: 400 }
      );
    }

    // Atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check sample exists and is active
      const sample = await tx.sample.findUnique({
        where: { id: sampleId },
      });

      if (!sample || !sample.isActive || sample.status !== "PUBLISHED") {
        throw new Error("Sample not found or not available");
      }

      // 2. Check not already purchased
      const existingPurchase = await tx.purchase.findUnique({
        where: {
          userId_sampleId: {
            userId: authUser.id,
            sampleId,
          },
        },
      });

      if (existingPurchase) {
        throw new Error("You already own this sample");
      }

      // 3. Check sufficient credits
      const user = await tx.user.findUnique({
        where: { id: authUser.id },
        include: { creditBalance: true },
      });

      if (!user) {
        throw new Error("User not found");
      }

      const userCredits = user.creditBalance?.balance ?? user.credits;

      if (userCredits < sample.creditPrice) {
        throw new Error(
          `Insufficient credits. You have ${userCredits}, need ${sample.creditPrice}`
        );
      }

      // 4. Deduct credits from creditBalance
      if (user.creditBalance) {
        await tx.creditBalance.update({
          where: { userId: authUser.id },
          data: { balance: { decrement: sample.creditPrice } },
        });
      }

      // 5. Deduct from user.credits too
      await tx.user.update({
        where: { id: authUser.id },
        data: { credits: { decrement: sample.creditPrice } },
      });

      // 6. Create purchase record
      const purchase = await tx.purchase.create({
        data: {
          userId: authUser.id,
          sampleId,
          creditsSpent: sample.creditPrice,
        },
      });

      // 7. Create credit transaction record
      await tx.creditTransaction.create({
        data: {
          userId: authUser.id,
          amount: -sample.creditPrice,
          type: "PURCHASE",
          referenceId: purchase.id,
          note: `Purchased sample: ${sample.name}`,
        },
      });

      // 8. Increment sample downloadCount
      await tx.sample.update({
        where: { id: sampleId },
        data: { downloadCount: { increment: 1 } },
      });

      return purchase;
    });

    return NextResponse.json({ purchase: result }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Purchase failed";
    console.error("POST /api/purchases error:", message);

    const status = message.includes("Insufficient")
      ? 402
      : message.includes("already own")
      ? 409
      : message.includes("not found")
      ? 404
      : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

// GET /api/purchases — Auth required, return user's purchased sample IDs
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const purchases = await prisma.purchase.findMany({
      where: { userId: authUser.id },
      select: { sampleId: true },
    });

    const sampleIds = purchases.map((p) => p.sampleId);

    return NextResponse.json({ sampleIds });
  } catch (error) {
    console.error("GET /api/purchases error:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchases" },
      { status: 500 }
    );
  }
}
