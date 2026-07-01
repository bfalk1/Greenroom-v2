import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Service role key bypasses RLS. Must be a session-free client so minting runs
// with service-role privileges and needs no bucket write RLS policy.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Mint a short-lived Supabase signed upload URL so the browser PUTs the
// application ZIP DIRECTLY to storage. The bytes never flow through this
// function, which is subject to Vercel's fixed 4.5MB request-body limit (it
// 413'd the 50MB portfolio ZIPs when posted here as multipart).
export async function POST(request: NextRequest) {
  try {
    // Applicants are not creators yet — only require an authenticated user.
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      filename?: string;
      size?: number;
    } | null;

    if (!body?.filename || !body.filename.toLowerCase().endsWith(".zip")) {
      return NextResponse.json({ error: "File must be a ZIP" }, { status: 400 });
    }
    if (!body.size || body.size <= 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    if (body.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File must be under 50MB" }, { status: 400 });
    }

    // Store at a per-user path. The bucket-relative path (no bucket prefix) is
    // what gets saved to CreatorApplication.sampleZipUrl and later signed by the
    // moderator download route.
    const safeName = body.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${user.id}/${Date.now()}_${safeName}`;

    const { data, error } = await supabaseAdmin.storage
      .from("applications")
      .createSignedUploadUrl(filePath);

    if (error || !data) {
      console.error("Application signed upload URL error:", error);
      return NextResponse.json({ error: "Could not start upload" }, { status: 500 });
    }

    return NextResponse.json({
      uploadPath: filePath, // pass to uploadToSignedUrl (bucket: applications)
      token: data.token,
      path: filePath, // stored bucket-relative in CreatorApplication.sampleZipUrl
      fileName: body.filename,
    });
  } catch (error) {
    console.error("Application upload init error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
