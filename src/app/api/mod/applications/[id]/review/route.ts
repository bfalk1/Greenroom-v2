import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// POST /api/mod/applications/[id]/review — approve or deny a creator application
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  const body = await req.json();
  const { decision, note } = body as { decision: string; note?: string };

  if (!decision || !["approve", "deny"].includes(decision)) {
    return NextResponse.json(
      { error: "Decision must be 'approve' or 'deny'" },
      { status: 400 }
    );
  }

  // Find the application
  const application = await prisma.creatorApplication.findUnique({
    where: { id },
  });

  if (!application) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 }
    );
  }

  if (application.status !== "PENDING") {
    return NextResponse.json(
      { error: "Application has already been reviewed" },
      { status: 409 }
    );
  }

  const newStatus = decision === "approve" ? "APPROVED" : "DENIED";

  // Use a transaction to update application + user role + audit log
  const result = await prisma.$transaction(async (tx) => {
    // Update the application
    const updated = await tx.creatorApplication.update({
      where: { id },
      data: {
        status: newStatus,
        reviewedBy: user.id,
        reviewNote: note || null,
        reviewedAt: new Date(),
      },
    });

    // If approved, promote user to CREATOR and set artistName
    // Don't downgrade MODERATOR/ADMIN users — only promote USER → CREATOR
    if (decision === "approve") {
      const applicant = await tx.user.findUnique({
        where: { id: application.userId },
        select: { role: true },
      });

      const updateData: Record<string, unknown> = {
        artistName: application.artistName,
      };

      // Only set role to CREATOR if user is currently a regular USER
      if (applicant?.role === "USER") {
        updateData.role = "CREATOR";
      }

      await tx.user.update({
        where: { id: application.userId },
        data: updateData,
      });
    }

    // Create audit log
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: decision === "approve" ? "CREATOR_APPROVED" : "CREATOR_DENIED",
        targetType: "CreatorApplication",
        targetId: application.id,
        metadata: {
          artistName: application.artistName,
          applicantUserId: application.userId,
          note: note || null,
        },
      },
    });

    return updated;
  });

  return NextResponse.json({ application: result });
}
