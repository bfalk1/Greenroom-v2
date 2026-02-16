import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Cache signed URLs in memory (they last 1 hour)
const urlCache = new Map<string, { url: string; expires: number }>();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check cache first
    const cached = urlCache.get(id);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json({ url: cached.url });
    }

    const sample = await prisma.sample.findUnique({
      where: { id, status: "PUBLISHED", isActive: true },
      select: { previewUrl: true, fileUrl: true },
    });

    if (!sample) {
      return NextResponse.json({ error: "Sample not found" }, { status: 404 });
    }

    // SECURITY: Only serve actual previews, never the full file
    // Previews are stored in the "previews" bucket as compressed MP3s
    // If no preview exists yet, the sample cannot be previewed
    const storagePath = sample.previewUrl;
    
    if (!storagePath) {
      return NextResponse.json({ 
        error: "Preview not available yet",
        hint: "Preview is being generated" 
      }, { status: 404 });
    }
    
    // Extra safety: reject if previewUrl points to the full file (samples bucket)
    if (storagePath.startsWith("samples/")) {
      return NextResponse.json({ 
        error: "Preview not available yet",
        hint: "Preview is being generated" 
      }, { status: 404 });
    }

    const parts = storagePath.split("/");
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
      console.error("Preview URL error:", error);
      return NextResponse.json(
        { error: "Failed to generate preview" },
        { status: 500 }
      );
    }

    // Cache the URL
    urlCache.set(id, { url: data.signedUrl, expires: Date.now() + 3500000 });

    // Clean old cache entries periodically
    if (urlCache.size > 500) {
      const now = Date.now();
      for (const [key, val] of urlCache) {
        if (val.expires < now) urlCache.delete(key);
      }
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    console.error("Preview error:", error);
    return NextResponse.json(
      { error: "Failed to load preview" },
      { status: 500 }
    );
  }
}
