import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isOwnedStorageRef } from "@/lib/storage";
import { verifyStoredImage, removeObject } from "@/lib/storageValidate";

// Service role bypasses RLS. Must be a session-free client so minting runs with
// service-role privileges and needs no bucket write RLS policy.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const STORE_EXT: Record<string, "jpg" | "png" | "webp"> = {
  ".jpg": "jpg",
  ".jpeg": "jpg",
  ".png": "png",
  ".webp": "webp",
};

// Two-phase avatar upload. The image is PUT directly to the public `avatars`
// bucket via a signed URL (bypassing Vercel's 4.5MB function-body limit), so
// this route (1) mints the signed URL, then (2) finalizes: re-validates the
// stored image by magic bytes — a renamed active-content file would otherwise
// be served publicly — and saves it to the user profile.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      filename?: string;
      size?: number;
      finalizePath?: string;
    } | null;

    if (!body) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Phase 2: finalize — validate the stored object and persist it.
    if (body.finalizePath) {
      const path = body.finalizePath;
      if (!isOwnedStorageRef(`avatars/${path}`, "avatars", user.id)) {
        return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
      }
      const check = await verifyStoredImage("avatars", path, MAX_BYTES);
      if (!check.ok) {
        await removeObject("avatars", path);
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      const { data: { publicUrl } } = supabaseAdmin.storage.from("avatars").getPublicUrl(path);
      await prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl: publicUrl },
      });
      return NextResponse.json({ url: publicUrl });
    }

    // Phase 1: mint a signed upload URL.
    const ext = "." + (body.filename?.split(".").pop()?.toLowerCase() || "");
    const contentType = IMAGE_CONTENT_TYPES[ext];
    const storeExt = STORE_EXT[ext];
    if (!contentType || !storeExt) {
      return NextResponse.json(
        { error: "Image must be a JPG, PNG, or WebP" },
        { status: 400 }
      );
    }
    if (body.size && body.size > MAX_BYTES) {
      return NextResponse.json({ error: "File must be smaller than 5MB" }, { status: 400 });
    }

    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${storeExt}`;
    const { data, error } = await supabaseAdmin.storage
      .from("avatars")
      .createSignedUploadUrl(path);
    if (error || !data) {
      console.error("Avatar signed upload URL error:", error);
      return NextResponse.json({ error: "Could not start upload" }, { status: 500 });
    }

    return NextResponse.json({ uploadPath: path, token: data.token, contentType });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
