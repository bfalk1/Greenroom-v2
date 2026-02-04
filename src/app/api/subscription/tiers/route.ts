import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const tiers = await prisma.subscriptionTier.findMany({
      where: { isActive: true },
      orderBy: { priceUsdCents: "asc" },
    });

    return NextResponse.json({ tiers });
  } catch (error) {
    console.error("Error fetching tiers:", error);
    return NextResponse.json(
      { error: "Failed to fetch tiers" },
      { status: 500 }
    );
  }
}
