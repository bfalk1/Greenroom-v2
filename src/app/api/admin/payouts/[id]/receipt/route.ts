import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSafeStorageRef } from "@/lib/storage";
import { verifyStoredReceipt, removeObject } from "@/lib/storageValidate";

// Service role bypasses RLS. Must be a session-free client so minting runs with
// service-role privileges and needs no bucket write RLS policy.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = "payout-receipts";
const MAX_BYTES = 10 * 1024 * 1024;
const RECEIPT_CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};
const STORE_EXT: Record<string, "pdf" | "png" | "jpg"> = {
  ".pdf": "pdf",
  ".png": "png",
  ".jpg": "jpg",
  ".jpeg": "jpg",
};

// POST /api/admin/payouts/[id]/receipt — two-phase proof-of-payment upload.
// The file is PUT directly to the PRIVATE `payout-receipts` bucket via a signed
// URL (bypassing Vercel's 4.5MB function-body limit), so this route (1) mints
// the signed URL, then (2) finalizes: re-validates the stored bytes by magic
// number and persists the path onto the payout. A new receipt replaces any
// previous one.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await createServerClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    });

    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const payout = await prisma.creatorPayout.findUnique({
      where: { id },
      select: { id: true, creatorId: true, receiptPath: true },
    });

    if (!payout) {
      return NextResponse.json({ error: "Payout not found" }, { status: 404 });
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
      if (
        !isSafeStorageRef(`${BUCKET}/${path}`, BUCKET) ||
        !path.startsWith(`${id}/`)
      ) {
        return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
      }
      const check = await verifyStoredReceipt(BUCKET, path, MAX_BYTES);
      if (!check.ok) {
        await removeObject(BUCKET, path);
        return NextResponse.json({ error: check.error }, { status: 400 });
      }

      const previousPath = payout.receiptPath;
      const receiptUploadedAt = new Date();
      await prisma.creatorPayout.update({
        where: { id },
        data: { receiptPath: path, receiptUploadedAt },
      });

      // Replacing: drop the superseded object (best-effort).
      if (previousPath && previousPath !== path) {
        await removeObject(BUCKET, previousPath);
      }

      await prisma.auditLog.create({
        data: {
          actorId: authUser.id,
          action: "RECEIPT_UPLOADED",
          targetType: "CreatorPayout",
          targetId: id,
          metadata: {
            creatorId: payout.creatorId,
            receiptPath: path,
            replacedPath: previousPath ?? null,
          },
        },
      });

      return NextResponse.json({
        receiptPath: path,
        receiptUploadedAt: receiptUploadedAt.toISOString(),
      });
    }

    // Phase 1: mint a signed upload URL.
    const ext = "." + (body.filename?.split(".").pop()?.toLowerCase() || "");
    const contentType = RECEIPT_CONTENT_TYPES[ext];
    const storeExt = STORE_EXT[ext];
    if (!contentType || !storeExt) {
      return NextResponse.json(
        { error: "Receipt must be a PDF, JPG, or PNG" },
        { status: 400 }
      );
    }
    if (body.size && body.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File must be smaller than 10MB" },
        { status: 400 }
      );
    }

    const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${storeExt}`;
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      console.error("Receipt signed upload URL error:", error);
      return NextResponse.json({ error: "Could not start upload" }, { status: 500 });
    }

    return NextResponse.json({ uploadPath: path, token: data.token, contentType });
  } catch (error) {
    console.error("POST /api/admin/payouts/[id]/receipt error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
