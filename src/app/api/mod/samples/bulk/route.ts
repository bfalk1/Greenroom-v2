import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { buildSampleUpdateData } from "@/lib/sampleMetadata";

const MAX_BULK = 500;

// POST /api/mod/samples/bulk — bulk edit / approve / reject / delete (MOD/ADMIN).
// Body: { sampleIds: string[], action?: "approve"|"reject"|"delete", metadata?: {...} }
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
    select: { id: true, role: true },
  });

  if (!dbUser || (dbUser.role !== "MODERATOR" && dbUser.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { sampleIds, action, metadata } = body as {
    sampleIds?: unknown;
    action?: "approve" | "reject" | "delete";
    metadata?: Record<string, unknown>;
  };

  if (!Array.isArray(sampleIds) || sampleIds.length === 0) {
    return NextResponse.json({ error: "sampleIds required" }, { status: 400 });
  }
  if (sampleIds.length > MAX_BULK) {
    return NextResponse.json({ error: `Too many samples (max ${MAX_BULK})` }, { status: 400 });
  }
  const ids = sampleIds.filter((id): id is string => typeof id === "string");

  const samples = await prisma.sample.findMany({
    where: { id: { in: ids } },
    select: { id: true, previewUrl: true },
  });
  const foundIds = samples.map((s) => s.id);
  if (foundIds.length === 0) {
    return NextResponse.json({ error: "No matching samples" }, { status: 404 });
  }

  if (action) {
    if (action === "approve") {
      // Only samples with a generated preview can be published.
      const ready = samples
        .filter((s) => s.previewUrl && s.previewUrl.startsWith("previews/"))
        .map((s) => s.id);
      const skipped = foundIds.length - ready.length;

      if (ready.length > 0) {
        // Reactivate on publish — a sent-back (isActive:false) sample that's
        // revised and re-approved must go live again.
        await prisma.sample.updateMany({
          where: { id: { in: ready } },
          data: { status: "PUBLISHED", isActive: true },
        });
        await prisma.auditLog.createMany({
          data: ready.map((id) => ({
            actorId: dbUser.id,
            action: "SAMPLE_APPROVED",
            targetType: "Sample",
            targetId: id,
          })),
        });
      }

      return NextResponse.json({
        updated: ready.length,
        skipped,
        ...(skipped > 0 ? { message: `Approved ${ready.length}, skipped ${skipped} (preview not ready)` } : {}),
      });
    }

    if (action === "reject") {
      await prisma.sample.updateMany({
        where: { id: { in: foundIds } },
        data: { status: "DRAFT", isActive: false },
      });
      await prisma.auditLog.createMany({
        data: foundIds.map((id) => ({
          actorId: dbUser.id,
          action: "SAMPLE_REJECTED",
          targetType: "Sample",
          targetId: id,
        })),
      });
      return NextResponse.json({ updated: foundIds.length });
    }

    if (action === "delete") {
      // Terminal takedown — mirror the single-sample DELETE behaviour.
      await prisma.sample.updateMany({
        where: { id: { in: foundIds } },
        data: { isActive: false, status: "REMOVED" },
      });
      await prisma.auditLog.createMany({
        data: foundIds.map((id) => ({
          actorId: dbUser.id,
          action: "SAMPLE_DELETED",
          targetType: "Sample",
          targetId: id,
        })),
      });
      return NextResponse.json({ updated: foundIds.length });
    }

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

  await prisma.sample.updateMany({
    where: { id: { in: foundIds } },
    data: built.data,
  });
  await prisma.auditLog.createMany({
    data: foundIds.map((id) => ({
      actorId: dbUser.id,
      action: "SAMPLE_EDITED",
      targetType: "Sample",
      targetId: id,
      metadata: built.data as object,
    })),
  });

  return NextResponse.json({ updated: foundIds.length });
}
