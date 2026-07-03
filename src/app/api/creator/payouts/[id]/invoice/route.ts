import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { renderPayoutInvoiceHtml } from "@/lib/payoutInvoice";

// GET /api/creator/payouts/[id]/invoice — render the invoice for a payout.
//
// The invoice is *generated* when the payout is requested (invoice number and
// processing fee are locked onto the row at that moment); this route only
// renders those stored values as a printable HTML document, so what it shows
// can never drift from what was requested.
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
            fullName: true,
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

    // Rows created before invoice numbers existed keep the legacy derived id.
    const invoiceNumber =
      payout.invoiceNumber ??
      `GR-${payout.periodEnd.getUTCFullYear()}${String(
        payout.periodEnd.getUTCMonth() + 1
      ).padStart(2, "0")}-${payout.id.slice(0, 8).toUpperCase()}`;

    const html = renderPayoutInvoiceHtml({
      invoiceNumber,
      status: payout.status,
      payeeName:
        payout.creator.artistName ||
        payout.creator.fullName ||
        payout.creator.username ||
        "Creator",
      payeeEmail: payout.creator.email,
      totalCreditsSpent: payout.totalCreditsSpent,
      grossCents: payout.amountUsdCents,
      processingFeeCents: payout.processingFeeCents,
      issuedAt: payout.createdAt,
      periodStart: payout.periodStart,
      periodEnd: payout.periodEnd,
      paidAt: payout.paidAt,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${invoiceNumber}.html"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Invoice generation error:", error);
    return NextResponse.json({ error: "Failed to generate invoice" }, { status: 500 });
  }
}
