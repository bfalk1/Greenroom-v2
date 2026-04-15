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
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};

  if (statusFilter && ["DRAFT", "REVIEW", "PUBLISHED"].includes(statusFilter)) {
    where.status = statusFilter;
  } else {
    where.status = { in: ["DRAFT", "REVIEW"] };
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
      include: {
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
    await prisma.preset.update({
      where: { id: presetId },
      data: { status: "PUBLISHED" },
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

  await prisma.preset.update({
    where: { id: presetId },
    data: { isActive: false, status: "DRAFT" },
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
