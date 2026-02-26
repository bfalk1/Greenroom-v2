import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// GET /api/mod/samples — list samples with search, filters, stats
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check role
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
  const view = searchParams.get("view"); // "pending", "all", "lowest-rated"
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  // Build where clause
  const where: Record<string, unknown> = {};
  
  if (view === "lowest-rated") {
    // Show published samples with low ratings
    where.status = "PUBLISHED";
    where.ratingCount = { gt: 0 };
    where.ratingAvg = { lt: 3 };
  } else if (view === "all") {
    // No status filter - show all
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { genre: { contains: search, mode: "insensitive" } },
        { instrumentType: { contains: search, mode: "insensitive" } },
        { tags: { has: search.toLowerCase() } },
      ];
    }
  } else {
    // Default: pending review
    if (statusFilter && ["DRAFT", "REVIEW", "PUBLISHED"].includes(statusFilter)) {
      where.status = statusFilter;
    } else {
      where.status = { in: ["DRAFT", "REVIEW"] };
      // Only show samples with previews ready for pending queue
      where.previewUrl = { startsWith: "previews/" };
    }
  }

  // Add search to pending view too
  if (search && view !== "all") {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { genre: { contains: search, mode: "insensitive" } },
      { creator: { artistName: { contains: search, mode: "insensitive" } } },
      { creator: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy = view === "lowest-rated" 
    ? { ratingAvg: "asc" as const }
    : { createdAt: "desc" as const };

  const [samples, total] = await Promise.all([
    prisma.sample.findMany({
      where,
      orderBy,
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
    prisma.sample.count({ where }),
  ]);

  // Get sample stats
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const [samplesThisMonth, samplesThisYear, totalSamples] = await Promise.all([
    prisma.sample.count({
      where: { createdAt: { gte: startOfMonth } },
    }),
    prisma.sample.count({
      where: { createdAt: { gte: startOfYear } },
    }),
    prisma.sample.count(),
  ]);

  return NextResponse.json({ 
    samples, 
    total,
    stats: {
      samplesThisMonth,
      samplesThisYear,
      totalSamples,
    },
  });
}

// PATCH /api/mod/samples — approve/reject OR edit any sample metadata (MODERATOR/ADMIN)
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
  const { sampleId, action, ...metadata } = body as { 
    sampleId: string; 
    action?: "approve" | "reject";
    [key: string]: unknown;
  };

  if (!sampleId) {
    return NextResponse.json({ error: "sampleId required" }, { status: 400 });
  }

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) {
    return NextResponse.json({ error: "Sample not found" }, { status: 404 });
  }

  // If action is provided, handle approve/reject
  if (action) {
    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (action === "approve") {
      // Check if preview is ready before allowing approval
      if (!sample.previewUrl || !sample.previewUrl.startsWith("previews/")) {
        return NextResponse.json({ 
          error: "Cannot approve: preview not ready yet. Please wait for preview generation." 
        }, { status: 400 });
      }

      await prisma.sample.update({
        where: { id: sampleId },
        data: { status: "PUBLISHED" },
      });

      await prisma.auditLog.create({
        data: {
          actorId: dbUser.id,
          action: "SAMPLE_APPROVED",
          targetType: "Sample",
          targetId: sampleId,
        },
      });
    } else {
      await prisma.sample.update({
        where: { id: sampleId },
        data: { status: "DRAFT", isActive: false },
      });

      await prisma.auditLog.create({
        data: {
          actorId: dbUser.id,
          action: "SAMPLE_REJECTED",
          targetType: "Sample",
          targetId: sampleId,
        },
      });
    }

    return NextResponse.json({ success: true });
  }

  // Otherwise, edit metadata (Mod/Admin can edit ANY sample)
  const allowedFields = [
    "name",
    "genre",
    "instrumentType",
    "sampleType",
    "key",
    "bpm",
    "creditPrice",
    "tags",
    "coverImageUrl",
    "status",
  ];

  const updateData: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (metadata[field] !== undefined) {
      if (field === "bpm" || field === "creditPrice") {
        updateData[field] = parseInt(metadata[field] as string);
      } else if (field === "tags" && typeof metadata[field] === "string") {
        updateData[field] = (metadata[field] as string)
          .split(",")
          .map((t: string) => t.trim().toLowerCase());
      } else {
        updateData[field] = metadata[field];
      }
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.sample.update({
    where: { id: sampleId },
    data: updateData,
  });

  await prisma.auditLog.create({
    data: {
      actorId: dbUser.id,
      action: "SAMPLE_EDITED",
      targetType: "Sample",
      targetId: sampleId,
      metadata: JSON.stringify(updateData),
    },
  });

  return NextResponse.json({ sample: updated });
}

// DELETE /api/mod/samples — delete a sample (MODERATOR/ADMIN only)
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
  const sampleId = searchParams.get("sampleId");

  if (!sampleId) {
    return NextResponse.json({ error: "sampleId required" }, { status: 400 });
  }

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) {
    return NextResponse.json({ error: "Sample not found" }, { status: 404 });
  }

  // Soft delete: mark as inactive and set back to draft
  await prisma.sample.update({
    where: { id: sampleId },
    data: { isActive: false, status: "DRAFT" },
  });

  await prisma.auditLog.create({
    data: {
      actorId: dbUser.id,
      action: "SAMPLE_DELETED",
      targetType: "Sample",
      targetId: sampleId,
      metadata: JSON.stringify({ name: sample.name, creatorId: sample.creatorId }),
    },
  });

  return NextResponse.json({ success: true });
}

// POST /api/mod/samples — flag a creator account for admin review
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
  const { creatorId, reason } = body;

  if (!creatorId) {
    return NextResponse.json({ error: "creatorId required" }, { status: 400 });
  }

  const creator = await prisma.user.findUnique({ where: { id: creatorId } });
  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  // Flag the account
  await prisma.user.update({
    where: { id: creatorId },
    data: {
      isFlagged: true,
      flagReason: reason || "Flagged by moderator for review",
      flaggedAt: new Date(),
      flaggedBy: dbUser.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: dbUser.id,
      action: "USER_FLAGGED",
      targetType: "User",
      targetId: creatorId,
      metadata: { reason },
    },
  });

  return NextResponse.json({ success: true });
}
