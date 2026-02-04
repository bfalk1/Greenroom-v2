import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sampleId: string }> }
) {
  try {
    const { sampleId } = await params;
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check user owns this sample
    const purchase = await prisma.purchase.findUnique({
      where: {
        userId_sampleId: {
          userId: authUser.id,
          sampleId,
        },
      },
      include: { sample: true },
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "Sample not purchased" },
        { status: 403 }
      );
    }

    const fileUrl = purchase.sample.fileUrl;
    if (!fileUrl) {
      return NextResponse.json(
        { error: "No file available" },
        { status: 404 }
      );
    }

    // Extract bucket and path from the stored fileUrl
    // Format: "samples/userId/filename.wav"
    const parts = fileUrl.split("/");
    const bucket = parts[0];
    const path = parts.slice(1).join("/");

    // Create a service client for signed URL generation
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await serviceClient.storage
      .from(bucket)
      .createSignedUrl(path, 60); // 60 second expiry

    if (error || !data?.signedUrl) {
      console.error("Signed URL error:", error);
      return NextResponse.json(
        { error: "Failed to generate download link" },
        { status: 500 }
      );
    }

    // Log the download
    await prisma.download.create({
      data: {
        purchaseId: purchase.id,
        userId: authUser.id,
        sampleId,
      },
    });

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to process download" },
      { status: 500 }
    );
  }
}
