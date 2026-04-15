import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// File extension to MIME type mapping for preset files
const PRESET_MIME_TYPES: Record<string, string> = {
  ".fxp": "application/octet-stream",
  ".vital": "application/octet-stream",
  ".phaseplant": "application/octet-stream",
  ".nmsv": "application/octet-stream",
  ".aupreset": "application/octet-stream",
  ".zip": "application/zip",
  ".syx": "application/octet-stream",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ presetId: string }> }
) {
  try {
    const { presetId } = await params;
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check user owns this preset
    const purchase = await prisma.purchase.findFirst({
      where: {
        userId: authUser.id,
        presetId,
      },
      include: { preset: true },
    });

    if (!purchase || !purchase.preset) {
      return NextResponse.json(
        { error: "Preset not purchased" },
        { status: 403 }
      );
    }

    const fileUrl = purchase.preset.fileUrl;
    if (!fileUrl) {
      return NextResponse.json(
        { error: "No file available" },
        { status: 404 }
      );
    }

    // Extract bucket and path from the stored fileUrl
    // Format: "presets/userId/filename.fxp"
    const parts = fileUrl.split("/");
    const bucket = parts[0];
    const path = parts.slice(1).join("/");

    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await serviceClient.storage
      .from(bucket)
      .download(path);

    if (error || !data) {
      console.error("Download error:", error);
      return NextResponse.json(
        { error: "Failed to download file" },
        { status: 500 }
      );
    }

    // Log the download
    await prisma.download.create({
      data: {
        purchaseId: purchase.id,
        userId: authUser.id,
        presetId,
      },
    });

    // Determine file extension and MIME type
    const ext = fileUrl.substring(fileUrl.lastIndexOf(".")).toLowerCase();
    const contentType = PRESET_MIME_TYPES[ext] || "application/octet-stream";

    // Generate a clean filename
    const filename = purchase.preset.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") + ext;

    const buffer = await data.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Preset download error:", error);
    return NextResponse.json(
      { error: "Failed to process download" },
      { status: 500 }
    );
  }
}
