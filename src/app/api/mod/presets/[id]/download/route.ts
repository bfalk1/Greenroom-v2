import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Mod/Admin endpoint - signed URL for the raw preset file so moderators can
// audition it before approving
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

    // Get the preset
    const preset = await prisma.preset.findUnique({
      where: { id },
      select: { fileUrl: true, name: true },
    });

    if (!preset || !preset.fileUrl) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    // Get signed URL for the preset file
    const parts = preset.fileUrl.split("/");
    const bucket = parts[0];
    const path = parts.slice(1).join("/");

    // Defense-in-depth: preset files always live in the private `presets` bucket.
    if (bucket !== "presets" || !path || preset.fileUrl.includes("..")) {
      return NextResponse.json({ error: "Invalid file reference" }, { status: 400 });
    }

    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Preset formats aren't viewable in-browser, so force an attachment with a
    // clean filename (same convention as the purchaser download route).
    const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLowerCase() : "";
    const filename =
      preset.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") + ext;

    const { data, error } = await serviceClient.storage
      .from(bucket)
      .createSignedUrl(path, 3600, { download: filename }); // 1 hour

    if (error || !data?.signedUrl) {
      console.error("Preset download URL error:", error);
      return NextResponse.json(
        { error: "Failed to generate download URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    console.error("Mod preset download error:", error);
    return NextResponse.json(
      { error: "Failed to load preset file" },
      { status: 500 }
    );
  }
}
