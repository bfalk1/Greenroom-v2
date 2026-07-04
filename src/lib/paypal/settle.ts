import { prisma } from "@/lib/prisma";

/**
 * Grant the credits for a captured PayPal order, exactly once.
 *
 * Both the return redirect and the webhook call this; the CREATED -> COMPLETED
 * status guard means only the first caller performs the grant — the other
 * matches zero rows and returns "already settled".
 */
export async function settlePaypalOrder(params: {
  orderId: string;
  captureId: string;
  capturedUsdCents: number | null;
}): Promise<"settled" | "already_settled" | "not_found" | "amount_mismatch"> {
  const order = await prisma.paypalOrder.findUnique({
    where: { id: params.orderId },
  });

  if (!order) {
    return "not_found";
  }

  // The amount PayPal captured must match what we quoted when creating the
  // order. A mismatch means tampering or a config bug — never grant on it.
  if (
    params.capturedUsdCents !== null &&
    params.capturedUsdCents !== order.amountUsdCents
  ) {
    console.error(
      `PayPal order ${order.id}: captured ${params.capturedUsdCents}¢ but expected ${order.amountUsdCents}¢ — not granting`
    );
    return "amount_mismatch";
  }

  const settled = await prisma.$transaction(async (tx) => {
    const claimed = await tx.paypalOrder.updateMany({
      where: { id: order.id, status: "CREATED" },
      data: { status: "COMPLETED", captureId: params.captureId },
    });

    if (claimed.count === 0) {
      return false;
    }

    await tx.creditBalance.upsert({
      where: { userId: order.userId },
      update: { balance: { increment: order.credits } },
      create: { userId: order.userId, balance: order.credits },
    });

    await tx.creditTransaction.create({
      data: {
        userId: order.userId,
        amount: order.credits,
        type: "PURCHASE",
        referenceId: params.captureId,
        note: `Purchased ${order.credits} credits (PayPal)`,
      },
    });

    return true;
  });

  if (settled) {
    console.log(
      `Issued ${order.credits} credits to user ${order.userId} (PayPal order ${order.id})`
    );
    return "settled";
  }

  return "already_settled";
}

/**
 * Claw back the credits for a refunded/reversed PayPal capture, exactly once
 * (COMPLETED -> REFUNDED status guard). Partial refunds are treated as full —
 * credit packs are refunded whole; admins can adjust manually if ever needed.
 * The balance may go negative if the credits were already spent.
 */
export async function refundPaypalOrder(
  captureId: string
): Promise<"refunded" | "already_refunded" | "not_found"> {
  const order = await prisma.paypalOrder.findFirst({
    where: { captureId },
  });

  if (!order) {
    return "not_found";
  }

  const refunded = await prisma.$transaction(async (tx) => {
    const claimed = await tx.paypalOrder.updateMany({
      where: { id: order.id, status: "COMPLETED" },
      data: { status: "REFUNDED" },
    });

    if (claimed.count === 0) {
      return false;
    }

    await tx.creditBalance.upsert({
      where: { userId: order.userId },
      update: { balance: { decrement: order.credits } },
      create: { userId: order.userId, balance: -order.credits },
    });

    await tx.creditTransaction.create({
      data: {
        userId: order.userId,
        amount: -order.credits,
        type: "REFUND",
        referenceId: captureId,
        note: `Refunded ${order.credits} credits (PayPal refund)`,
      },
    });

    return true;
  });

  if (refunded) {
    console.log(
      `Clawed back ${order.credits} credits from user ${order.userId} (PayPal order ${order.id} refunded)`
    );
    return "refunded";
  }

  return "already_refunded";
}

/**
 * Mark an order whose capture was denied (e.g. bounced eCheck) as terminal so
 * it can't sit in CREATED forever. Only CREATED orders flip — a COMPLETED
 * order followed by a denial would be a refund/reversal, not a denial.
 */
export async function denyPaypalOrder(
  captureId: string
): Promise<"denied" | "not_found"> {
  const updated = await prisma.paypalOrder.updateMany({
    where: { captureId, status: "CREATED" },
    data: { status: "DENIED" },
  });

  return updated.count > 0 ? "denied" : "not_found";
}
