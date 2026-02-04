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

// PATCH /api/mod/samples — approve or reject a sample
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
  const { sampleId, action } = body as { sampleId: string; action: "approve" | "reject" };

  if (!sampleId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) {
    return NextResponse.json({ error: "Sample not found" }, { status: 404 });
  }

  if (action === "approve") {
    await prisma.sample.update({
      where: { id: sampleId },
      data: { status: "PUBLISHED" },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: dbUser.id,
        action: "SAMPLE_APPROVED",
        targetType: "Sample",
        targetId: sampleId,
      },
    });
  } else {
    // Reject — set back to DRAFT and deactivate
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
