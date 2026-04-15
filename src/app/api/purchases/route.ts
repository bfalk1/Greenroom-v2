import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// POST /api/purchases — Auth required, purchase a sample or preset
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
    const { sampleId, presetId } = body;

    if (!sampleId && !presetId) {
      return NextResponse.json(
        { error: "sampleId or presetId is required" },
        { status: 400 }
      );
    }

    if (sampleId && presetId) {
      return NextResponse.json(
        { error: "Provide either sampleId or presetId, not both" },
        { status: 400 }
      );
    }

    // Atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      let itemName: string;
      let itemPrice: number;
      let itemType: "sample" | "preset";

      if (sampleId) {
        // Sample purchase
        const sample = await tx.sample.findUnique({
          where: { id: sampleId },
        });

        if (!sample || !sample.isActive || sample.status !== "PUBLISHED") {
          throw new Error("Sample not found or not available");
        }

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

        itemName = sample.name;
        itemPrice = sample.creditPrice;
        itemType = "sample";
      } else {
        // Preset purchase
        const preset = await tx.preset.findUnique({
          where: { id: presetId },
        });

        if (!preset || !preset.isActive || preset.status !== "PUBLISHED") {
          throw new Error("Preset not found or not available");
        }

        const existingPurchase = await tx.purchase.findFirst({
          where: {
            userId: authUser.id,
            presetId,
          },
        });

        if (existingPurchase) {
          throw new Error("You already own this preset");
        }

        itemName = preset.name;
        itemPrice = preset.creditPrice;
        itemType = "preset";
      }

      // Check sufficient credits
      const user = await tx.user.findUnique({
        where: { id: authUser.id },
        include: { creditBalance: true },
      });

      if (!user) {
        throw new Error("User not found");
      }

      const userCredits = user.creditBalance?.balance ?? user.credits ?? 0;

      if (userCredits < itemPrice) {
        throw new Error(
          `Insufficient credits. You have ${userCredits}, need ${itemPrice}`
        );
      }

      // Deduct credits from creditBalance
      if (user.creditBalance) {
        await tx.creditBalance.update({
          where: { userId: authUser.id },
          data: { balance: { decrement: itemPrice } },
        });
      }

      // Deduct from user.credits too
      await tx.user.update({
        where: { id: authUser.id },
        data: { credits: { decrement: itemPrice } },
      });

      // Create purchase record
      const purchase = await tx.purchase.create({
        data: {
          userId: authUser.id,
          sampleId: itemType === "sample" ? sampleId : null,
          presetId: itemType === "preset" ? presetId : null,
          creditsSpent: itemPrice,
        },
      });

      // Create credit transaction record
      await tx.creditTransaction.create({
        data: {
          userId: authUser.id,
          amount: -itemPrice,
          type: "PURCHASE",
          referenceId: purchase.id,
          note: `Purchased ${itemType}: ${itemName}`,
        },
      });

      // Increment download count on the item
      if (itemType === "sample") {
        await tx.sample.update({
          where: { id: sampleId },
          data: { downloadCount: { increment: 1 } },
        });
      } else {
        await tx.preset.update({
          where: { id: presetId },
          data: { downloadCount: { increment: 1 } },
        });
      }

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

// GET /api/purchases — Auth required, return user's purchased sample & preset IDs
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
      select: { sampleId: true, presetId: true },
    });

    const sampleIds = purchases
      .filter((p) => p.sampleId !== null)
      .map((p) => p.sampleId as string);

    const presetIds = purchases
      .filter((p) => p.presetId !== null)
      .map((p) => p.presetId as string);

    return NextResponse.json({ sampleIds, presetIds });
  } catch (error) {
    console.error("GET /api/purchases error:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchases" },
      { status: 500 }
    );
  }
}
