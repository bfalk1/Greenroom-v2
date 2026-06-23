import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { buildSampleUpdateData } from "@/lib/sampleMetadata";

const MAX_BULK = 500;

// POST /api/creator/samples/bulk — bulk edit / submit-for-review the creator's
// OWN samples. Body: { sampleIds: string[], action?: "submit", metadata?: {...} }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, isWhitelisted: true },
  });

  if (!dbUser || dbUser.role !== "CREATOR") {
    return NextResponse.json({ error: "Only creators can edit samples" }, { status: 403 });
  }

  const body = await req.json();
  const { sampleIds, action, metadata } = body as {
    sampleIds?: unknown;
    action?: "submit";
    metadata?: Record<string, unknown>;
  };

  if (!Array.isArray(sampleIds) || sampleIds.length === 0) {
    return NextResponse.json({ error: "sampleIds required" }, { status: 400 });
  }
  if (sampleIds.length > MAX_BULK) {
    return NextResponse.json({ error: `Too many samples (max ${MAX_BULK})` }, { status: 400 });
  }
  const ids = sampleIds.filter((id): id is string => typeof id === "string");

  // Scope strictly to the creator's own samples.
  const owned = await prisma.sample.findMany({
    where: { id: { in: ids }, creatorId: user.id },
    select: { id: true },
  });
  const ownedIds = owned.map((s) => s.id);
  if (ownedIds.length === 0) {
    return NextResponse.json({ error: "No matching samples" }, { status: 404 });
  }

  if (action === "submit") {
    // Only DRAFT samples can be submitted for review.
    const result = await prisma.sample.updateMany({
      where: { id: { in: ownedIds }, status: "DRAFT" },
      data: { status: "REVIEW" },
    });
    return NextResponse.json({ updated: result.count });
  }

  if (action) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // No action → bulk metadata edit.
  if (!metadata || typeof metadata !== "object") {
    return NextResponse.json({ error: "action or metadata required" }, { status: 400 });
  }
  const built = buildSampleUpdateData(metadata);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }
  if (Object.keys(built.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Enforce the same per-creator credit-price cap as the create route:
  // 50 for whitelisted creators, 5 otherwise.
  if (built.data.creditPrice !== undefined) {
    const maxCreditPrice = dbUser.isWhitelisted ? 50 : 5;
    if ((built.data.creditPrice as number) > maxCreditPrice) {
      return NextResponse.json(
        { error: `Credit price cannot exceed ${maxCreditPrice}` },
        { status: 400 }
      );
    }
  }

  const result = await prisma.sample.updateMany({
    where: { id: { in: ownedIds }, creatorId: user.id },
    data: built.data,
  });

  return NextResponse.json({ updated: result.count });
}
