import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { notifyModerationSafe, parseReviewNote } from "@/lib/notifications";

// GET /api/mod/presets — list presets for moderation
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (!dbUser || (dbUser.role !== "MODERATOR" && dbUser.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");
  const search = searchParams.get("search");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};

  // Pending = presets awaiting a moderator decision (REVIEW). DRAFT (sent back)
  // and REMOVED (taken down) are excluded so they don't flood the queue.
  // "ALL" opts out of status filtering entirely — used by the Search All view.
  if (statusFilter && ["DRAFT", "REVIEW", "PUBLISHED", "REMOVED"].includes(statusFilter)) {
    where.status = statusFilter;
  } else if (statusFilter !== "ALL") {
    where.status = "REVIEW";
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { genre: { contains: search, mode: "insensitive" } },
      { creator: { artistName: { contains: search, mode: "insensitive" } } },
      { creator: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [presets, total] = await Promise.all([
    prisma.preset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        creatorId: true,
        synthName: true,
        presetCategory: true,
        genre: true,
        tags: true,
        creditPrice: true,
        previewUrl: true,
        coverImageUrl: true,
        fileSizeBytes: true,
        compatibleVersions: true,
        isInitPreset: true,
        ratingAvg: true,
        ratingCount: true,
        status: true,
        isActive: true,
        createdAt: true,
        creator: {
          select: {
            id: true,
            fullName: true,
            artistName: true,
            username: true,
            email: true,
            isWhitelisted: true,
            isFlagged: true,
          },
        },
        // Real counts. Preset.downloadCount is deliberately NOT selected: it is
        // incremented on purchase, so surfacing it as "downloads" reports sales
        // a second time. Downloads are rows in the `downloads` table.
        _count: { select: { purchases: true, downloads: true } },
        // Advisory AI-detection result for the queue badge.
        audioScan: {
          select: {
            status: true,
            verdict: true,
            aiProbability: true,
            likelySource: true,
            flagged: true,
          },
        },
      },
    }),
    prisma.preset.count({ where }),
  ]);

  // Batch-sign preview URLs so moderators can audition presets in-browser
  // (mirrors the public /api/presets route). Preview audio lives in the
  // private `previews` bucket, stored as a "previews/<path>" reference.
  const { createClient: createServiceClient } = await import("@supabase/supabase-js");
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
  );

  const previewPaths = presets.map(p =>
    p.previewUrl?.startsWith("previews/") ? p.previewUrl.replace("previews/", "") : null
  );
  const validPaths = previewPaths.filter((p): p is string => p !== null);

  const signedUrlMap: Record<string, string> = {};
  if (validPaths.length > 0) {
    const { data } = await serviceClient.storage
      .from("previews")
      .createSignedUrls(validPaths, 3600);
    if (data) {
      for (const item of data) {
        if (item.signedUrl && item.path) signedUrlMap[item.path] = item.signedUrl;
      }
    }
  }

  // Map to a clean DTO: signed preview URL and BigInt fileSize coerced to a
  // Number (raw BigInt is not JSON-serializable).
  const mapped = presets.map((p, i) => {
    const path = previewPaths[i];
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      creatorId: p.creatorId,
      synthName: p.synthName,
      presetCategory: p.presetCategory,
      genre: p.genre,
      tags: p.tags,
      creditPrice: p.creditPrice,
      previewUrl: path ? signedUrlMap[path] ?? null : null,
      coverImageUrl: p.coverImageUrl,
      fileSizeBytes: p.fileSizeBytes != null ? Number(p.fileSizeBytes) : null,
      compatibleVersions: p.compatibleVersions,
      isInitPreset: p.isInitPreset,
      purchaseCount: p._count.purchases,
      downloadCount: p._count.downloads,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      status: p.status,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
      creator: p.creator,
      audioScan: p.audioScan,
    };
  });

  return NextResponse.json({ presets: mapped, total });
}

// PATCH /api/mod/presets — approve/reject a preset
export async function PATCH(req: NextRequest) {
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
  const { presetId, action, reviewNote: rawReviewNote } = body as {
    presetId: string;
    action: "approve" | "reject";
    reviewNote?: unknown;
  };

  if (!presetId || !action) {
    return NextResponse.json({ error: "presetId and action required" }, { status: 400 });
  }

  const preset = await prisma.preset.findUnique({ where: { id: presetId } });
  if (!preset) {
    return NextResponse.json({ error: "Preset not found" }, { status: 404 });
  }

  if (action === "approve") {
    // Reactivate on publish — reject sets isActive:false, so a sent-back preset
    // that's re-approved must go live again, and the old rejection reason no
    // longer applies.
    await prisma.preset.update({
      where: { id: presetId },
      data: { status: "PUBLISHED", isActive: true, reviewNote: null },
    });

    await prisma.auditLog.create({
      data: {
        actorId: dbUser.id,
        action: "PRESET_APPROVED",
        targetType: "Preset",
        targetId: presetId,
      },
    });

    await notifyModerationSafe("preset", "approved", [
      { id: preset.id, name: preset.name, creatorId: preset.creatorId },
    ]);
  } else if (action === "reject") {
    const parsed = parseReviewNote("rejected", rawReviewNote);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    await prisma.preset.update({
      where: { id: presetId },
      data: { status: "DRAFT", isActive: false, reviewNote: parsed.note },
    });

    await prisma.auditLog.create({
      data: {
        actorId: dbUser.id,
        action: "PRESET_REJECTED",
        targetType: "Preset",
        targetId: presetId,
        metadata: JSON.stringify({ reviewNote: parsed.note }),
      },
    });

    await notifyModerationSafe(
      "preset",
      "rejected",
      [{ id: preset.id, name: preset.name, creatorId: preset.creatorId }],
      parsed.note
    );
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/mod/presets — soft delete a preset
export async function DELETE(req: NextRequest) {
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

  const { searchParams } = new URL(req.url);
  const presetId = searchParams.get("presetId");

  if (!presetId) {
    return NextResponse.json({ error: "presetId required" }, { status: 400 });
  }

  // Optional on a takedown (unlike a reject, there's nothing to revise) but
  // still surfaced to the creator when the moderator gives one.
  const parsed = parseReviewNote("removed", searchParams.get("reviewNote"));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const preset = await prisma.preset.findUnique({ where: { id: presetId } });
  if (!preset) {
    return NextResponse.json({ error: "Preset not found" }, { status: 404 });
  }

  // Terminal takedown: unpublish and mark REMOVED so it stays out of the
  // moderation queue and the creator can't bring it back.
  await prisma.preset.update({
    where: { id: presetId },
    data: { isActive: false, status: "REMOVED", reviewNote: parsed.note },
  });

  await prisma.auditLog.create({
    data: {
      actorId: dbUser.id,
      action: "PRESET_DELETED",
      targetType: "Preset",
      targetId: presetId,
      metadata: JSON.stringify({
        name: preset.name,
        creatorId: preset.creatorId,
        reviewNote: parsed.note,
      }),
    },
  });

  await notifyModerationSafe(
    "preset",
    "removed",
    [{ id: preset.id, name: preset.name, creatorId: preset.creatorId }],
    parsed.note
  );

  return NextResponse.json({ success: true });
}
