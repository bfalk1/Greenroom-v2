import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/admin/moderators — List all moderators
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Get all users with MODERATOR role
    const moderators = await prisma.user.findMany({
      where: { role: "MODERATOR" },
      select: {
        id: true,
        email: true,
        username: true,
        artistName: true,
        fullName: true,
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ moderators });
  } catch (error) {
    console.error("GET /api/admin/moderators error:", error);
    return NextResponse.json(
      { error: "Failed to fetch moderators" },
      { status: 500 }
    );
  }
}

// POST /api/admin/moderators — Add a moderator by email
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const adminUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });

    if (adminUser?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Find user by email
    const targetUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found with that email" },
        { status: 404 }
      );
    }

    if (targetUser.role === "ADMIN") {
      return NextResponse.json(
        { error: "Cannot modify admin role" },
        { status: 400 }
      );
    }

    if (targetUser.role === "MODERATOR") {
      return NextResponse.json(
        { error: "User is already a moderator" },
        { status: 400 }
      );
    }

    // Update user role to MODERATOR
    const updatedUser = await prisma.user.update({
      where: { id: targetUser.id },
      data: { role: "MODERATOR" },
      select: {
        id: true,
        email: true,
        username: true,
        artistName: true,
        fullName: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actorId: authUser.id,
        action: "MODERATOR_ADDED",
        targetType: "User",
        targetId: targetUser.id,
        metadata: { email: targetUser.email },
      },
    });

    return NextResponse.json({
      message: "Moderator added successfully",
      moderator: updatedUser,
    });
  } catch (error) {
    console.error("POST /api/admin/moderators error:", error);
    return NextResponse.json(
      { error: "Failed to add moderator" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/moderators — Remove a moderator
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const adminUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });

    if (adminUser?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Find the moderator
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetUser.role !== "MODERATOR") {
      return NextResponse.json(
        { error: "User is not a moderator" },
        { status: 400 }
      );
    }

    // Demote to USER role
    await prisma.user.update({
      where: { id: userId },
      data: { role: "USER" },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actorId: authUser.id,
        action: "MODERATOR_REMOVED",
        targetType: "User",
        targetId: userId,
        metadata: { email: targetUser.email },
      },
    });

    return NextResponse.json({
      message: "Moderator removed successfully",
    });
  } catch (error) {
    console.error("DELETE /api/admin/moderators error:", error);
    return NextResponse.json(
      { error: "Failed to remove moderator" },
      { status: 500 }
    );
  }
}
