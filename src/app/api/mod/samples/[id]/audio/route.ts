import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Mod/Admin endpoint - serves the FULL audio file, not the preview
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check auth - must be mod or admin
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });

    if (!dbUser || (dbUser.role !== "MODERATOR" && dbUser.role !== "ADMIN")) {
      return NextResponse.json({ error: "Mod/Admin access required" }, { status: 403 });
    }

    // Get the sample
    const sample = await prisma.sample.findUnique({
      where: { id },
      select: { fileUrl: true, name: true },
    });

    if (!sample || !sample.fileUrl) {
      return NextResponse.json({ error: "Sample not found" }, { status: 404 });
    }

    // Get signed URL for the FULL file
    const parts = sample.fileUrl.split("/");
    const bucket = parts[0];
    const path = parts.slice(1).join("/");

    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await serviceClient.storage
      .from(bucket)
      .createSignedUrl(path, 3600); // 1 hour

    if (error || !data?.signedUrl) {
      console.error("Full audio URL error:", error);
      return NextResponse.json(
        { error: "Failed to generate audio URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    console.error("Mod audio error:", error);
    return NextResponse.json(
      { error: "Failed to load audio" },
      { status: 500 }
    );
  }
}
