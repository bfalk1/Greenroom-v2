import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { buildSampleUpdateData } from "@/lib/sampleMetadata";
import { removeObject } from "@/lib/storageValidate";
import {
  isOwnedStorageRef,
  isSafeStorageRef,
  ownedPublicObjectPath,
} from "@/lib/storage";

const MAX_BULK = 500;

// POST /api/creator/samples/bulk — bulk edit / submit-for-review / delete the
// creator's OWN samples.
// Body: { sampleIds: string[], action?: "submit" | "delete", metadata?: {...} }
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
    action?: "submit" | "delete";
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

  if (action === "delete") {
    // Mirror DELETE /api/samples/[id]: remove dependent rows and the samples in
    // one transaction so a mid-cascade failure can't leave a sample live while
    // its buyers' purchase/download history is already gone.
    const toDelete = await prisma.sample.findMany({
      where: { id: { in: ownedIds }, creatorId: user.id },
      select: { id: true, fileUrl: true, previewUrl: true, coverImageUrl: true },
    });
    const delIds = toDelete.map((s) => s.id);
    await prisma.$transaction(async (tx) => {
      await tx.download.deleteMany({ where: { sampleId: { in: delIds } } });
      await tx.purchase.deleteMany({ where: { sampleId: { in: delIds } } });
      await tx.rating.deleteMany({ where: { sampleId: { in: delIds } } });
      await tx.favorite.deleteMany({ where: { sampleId: { in: delIds } } });
      await tx.sample.deleteMany({ where: { id: { in: delIds } } });
    });

    // Best-effort storage cleanup AFTER the DB commit — the refs were validated
    // at write time, but re-check ownership here before handing them to the
    // service-role client. A failed removal only orphans a file, never a row.
    for (const s of toDelete) {
      if (isOwnedStorageRef(s.fileUrl, "samples", user.id)) {
        await removeObject("samples", s.fileUrl.slice("samples/".length));
      }
      if (s.previewUrl) {
        const p = s.previewUrl;
        const previewBucket = isOwnedStorageRef(p, "samples", user.id)
          ? "samples"
          : isSafeStorageRef(p, "previews")
            ? "previews"
            : null;
        if (previewBucket) {
          await removeObject(previewBucket, p.slice(previewBucket.length + 1));
        }
      }
      const coverPath = ownedPublicObjectPath(s.coverImageUrl, "covers", user.id);
      if (coverPath) await removeObject("covers", coverPath);
    }

    return NextResponse.json({ deleted: delIds.length });
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
