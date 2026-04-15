import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// GET /api/creator/apply — return user's existing application (if any)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const application = await prisma.creatorApplication.findUnique({
    where: { userId: user.id },
  });

  return NextResponse.json({ application });
}

// POST /api/creator/apply — submit a new creator application
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { artistName, bio, socialLinks, sampleZipUrl, termsAcceptedAt } = body;

  // Validate required fields
  if (!artistName || !sampleZipUrl) {
    return NextResponse.json(
      { error: "Artist name and sample ZIP are required" },
      { status: 400 }
    );
  }

  // Check for existing pending or approved application
  const existing = await prisma.creatorApplication.findUnique({
    where: { userId: user.id },
  });

  if (existing) {
    if (existing.status === "PENDING") {
      return NextResponse.json(
        { error: "You already have a pending application" },
        { status: 409 }
      );
    }
    if (existing.status === "APPROVED") {
      return NextResponse.json(
        { error: "You are already an approved creator" },
        { status: 409 }
      );
    }
    // If DENIED, allow resubmission by updating the existing record
    const updated = await prisma.creatorApplication.update({
      where: { userId: user.id },
      data: {
        artistName,
        bio: bio || null,
        socialLinks: socialLinks || null,
        sampleZipUrl,
        termsAcceptedAt: termsAcceptedAt ? new Date(termsAcceptedAt) : null,
        status: "PENDING",
        reviewedBy: null,
        reviewNote: null,
        reviewedAt: null,
      },
    });
    return NextResponse.json({ application: updated }, { status: 200 });
  }

  // Create new application
  const application = await prisma.creatorApplication.create({
    data: {
      userId: user.id,
      artistName,
      bio: bio || null,
      socialLinks: socialLinks || null,
      sampleZipUrl,
      termsAcceptedAt: termsAcceptedAt ? new Date(termsAcceptedAt) : null,
      status: "PENDING",
    },
  });

  return NextResponse.json({ application }, { status: 201 });
}
