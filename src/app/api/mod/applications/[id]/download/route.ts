import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// GET /api/mod/applications/[id]/download — generate signed URL for sample ZIP
export async function GET(
  _req: NextRequest,
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

  // The sampleZipUrl stores the storage path within the "applications" bucket
  const storagePath = application.sampleZipUrl;

  // Generate a signed URL (valid for 1 hour)
  const { data, error } = await supabase.storage
    .from("applications")
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) {
    console.error("Failed to create signed URL:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: data.signedUrl });
}
