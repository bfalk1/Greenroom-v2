import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/creator/payouts/[id]/invoice — Generate invoice for a payout
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payout = await prisma.creatorPayout.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            email: true,
            username: true,
            artistName: true,
          },
        },
      },
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

    // Generate simple text invoice (could be PDF in future)
    const invoiceNumber = `GR-${payout.periodEnd.getFullYear()}${String(payout.periodEnd.getMonth() + 1).padStart(2, "0")}-${payout.id.slice(0, 8).toUpperCase()}`;
    
    const invoice = `
================================================================================
                              GREENROOM PAYOUT INVOICE
================================================================================

Invoice Number: ${invoiceNumber}
Date Issued: ${payout.paidAt?.toLocaleDateString() || new Date().toLocaleDateString()}

--------------------------------------------------------------------------------
PAYEE INFORMATION
--------------------------------------------------------------------------------
Name: ${payout.creator.artistName || payout.creator.username || "Creator"}
Email: ${payout.creator.email}

--------------------------------------------------------------------------------
PAYOUT DETAILS
--------------------------------------------------------------------------------
Period: ${payout.periodStart.toLocaleDateString()} - ${payout.periodEnd.toLocaleDateString()}
Total Credits Earned: ${payout.totalCreditsSpent}
Payout Amount: $${(payout.amountUsdCents / 100).toFixed(2)} USD

Status: ${payout.status}
${payout.stripeTransferId ? `Stripe Transfer ID: ${payout.stripeTransferId}` : ""}
${payout.paidAt ? `Paid On: ${payout.paidAt.toLocaleDateString()}` : ""}

--------------------------------------------------------------------------------
PLATFORM INFORMATION
--------------------------------------------------------------------------------
Platform: Greenroom
Website: https://greenroom.app
Support: support@greenroom.app

================================================================================
                        Thank you for creating with Greenroom!
================================================================================
`;

    return new NextResponse(invoice, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="${invoiceNumber}.txt"`,
      },
    });
  } catch (error) {
    console.error("Invoice generation error:", error);
    return NextResponse.json({ error: "Failed to generate invoice" }, { status: 500 });
  }
}
