import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Service role key bypasses RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Applicants are not creators yet — only require an authenticated user.
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const zipFile = formData.get("zipFile") as File | null;

    if (!zipFile) {
      return NextResponse.json({ error: "ZIP file is required" }, { status: 400 });
    }
    if (!zipFile.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json({ error: "File must be a ZIP" }, { status: 400 });
    }
    if (zipFile.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    if (zipFile.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File must be under 50MB" }, { status: 400 });
    }

    // Store at a per-user path. The bucket-relative path (no bucket prefix) is
    // what gets saved to CreatorApplication.sampleZipUrl and later signed by the
    // moderator download route.
    const safeName = zipFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${user.id}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await zipFile.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from("applications")
      .upload(filePath, buffer, {
        contentType: zipFile.type || "application/zip",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Application ZIP upload error:", uploadError);
      return NextResponse.json({ error: "File upload failed" }, { status: 500 });
    }

    return NextResponse.json({ path: filePath, fileName: zipFile.name });
  } catch (error) {
    console.error("Application upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
