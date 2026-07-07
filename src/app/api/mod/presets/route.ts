import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

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
  const limitParam = parseInt(searchParams.get("limit") || "50", 10);
  const offsetParam = parseInt(searchParams.get("offset") || "0", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;
  const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;

  const where: Record<string, unknown> = {};

  // Pending = presets awaiting a moderator decision (REVIEW). DRAFT (sent back)
  // and REMOVED (taken down) are excluded so they don't flood the queue.
  if (statusFilter && ["DRAFT", "REVIEW", "PUBLISHED", "REMOVED"].includes(statusFilter)) {
    where.status = statusFilter;
  } else {
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
      // Explicit select: the full row includes fileSizeBytes (BigInt), which
      // NextResponse.json cannot serialize.
      select: {
        id: true,
        name: true,
        creatorId: true,
        description: true,
        synthName: true,
        presetCategory: true,
        genre: true,
        tags: true,
        creditPrice: true,
        status: true,
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
      },
    }),
    prisma.preset.count({ where }),
  ]);

  return NextResponse.json({ presets, total });
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
  const { presetId, action } = body as {
    presetId: string;
    action: "approve" | "reject";
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
    // that's re-approved must go live again.
    await prisma.preset.update({
      where: { id: presetId },
      data: { status: "PUBLISHED", isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: dbUser.id,
        action: "PRESET_APPROVED",
        targetType: "Preset",
        targetId: presetId,
      },
    });
  } else if (action === "reject") {
    await prisma.preset.update({
      where: { id: presetId },
      data: { status: "DRAFT", isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        actorId: dbUser.id,
        action: "PRESET_REJECTED",
        targetType: "Preset",
        targetId: presetId,
      },
    });
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

  const preset = await prisma.preset.findUnique({ where: { id: presetId } });
  if (!preset) {
    return NextResponse.json({ error: "Preset not found" }, { status: 404 });
  }

  // Terminal takedown: unpublish and mark REMOVED so it stays out of the
  // moderation queue and the creator can't bring it back.
  await prisma.preset.update({
    where: { id: presetId },
    data: { isActive: false, status: "REMOVED" },
  });

  await prisma.auditLog.create({
    data: {
      actorId: dbUser.id,
      action: "PRESET_DELETED",
      targetType: "Preset",
      targetId: presetId,
      metadata: JSON.stringify({ name: preset.name, creatorId: preset.creatorId }),
    },
  });

  return NextResponse.json({ success: true });
}
