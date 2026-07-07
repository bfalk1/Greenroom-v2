import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { isSafeStorageRef } from "@/lib/storage";

const BUCKET = "payout-receipts";

// GET /api/creator/payouts/[id]/receipt — short-lived signed URL for the
// proof-of-payment an admin attached to this payout. The bucket is private, so
// the payout's creator (or an admin) can only reach the object through here.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payout = await prisma.creatorPayout.findUnique({
      where: { id },
      select: { creatorId: true, receiptPath: true },
    });

    if (!payout) {
      return NextResponse.json({ error: "Payout not found" }, { status: 404 });
    }

    // Verify ownership
    if (payout.creatorId !== authUser.id) {
      const dbUser = await prisma.user.findUnique({
        where: { id: authUser.id },
        select: { role: true },
      });
      if (dbUser?.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    if (
      !payout.receiptPath ||
      !isSafeStorageRef(`${BUCKET}/${payout.receiptPath}`, BUCKET)
    ) {
      return NextResponse.json(
        { error: "No receipt for this payout" },
        { status: 404 }
      );
    }

    // Use service role client for storage access (bypasses RLS policies)
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await serviceClient.storage
      .from(BUCKET)
      .createSignedUrl(payout.receiptPath, 300);

    if (error || !data?.signedUrl) {
      console.error("Failed to create receipt signed URL:", error);
      return NextResponse.json(
        { error: "Failed to generate receipt URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    console.error("GET /api/creator/payouts/[id]/receipt error:", error);
    return NextResponse.json(
      { error: "Failed to fetch receipt" },
      { status: 500 }
    );
  }
}
