import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// GET /api/mod/samples — list samples needing review (MODERATOR/ADMIN only)
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

  // Optional status filter — defaults to DRAFT + REVIEW
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");

  let where: Record<string, unknown>;
  if (statusFilter && ["DRAFT", "REVIEW", "PUBLISHED"].includes(statusFilter)) {
    where = { status: statusFilter };
  } else {
    where = { status: { in: ["DRAFT", "REVIEW"] } };
  }

  const samples = await prisma.sample.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      creator: {
        select: {
          id: true,
          fullName: true,
          artistName: true,
          username: true,
          email: true,
        },
      },
    },
  });

  return NextResponse.json({ samples });
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

  // Soft delete: mark as inactive
  await prisma.sample.update({
    where: { id: sampleId },
    data: { isActive: false, status: "DELETED" },
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
