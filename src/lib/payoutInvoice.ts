import { computeNetPayoutCents } from "@/lib/payoutMath";

/**
 * Pure HTML renderer for payout invoices — no DB access, so it can be
 * unit-tested and can never drift from what the route serves. The invoice is
 * *generated* when the payout is created (invoice number + processing fee are
 * locked onto the row then); this just renders those stored values.
 */

export type PayoutInvoiceData = {
  invoiceNumber: string;
  status: "PENDING" | "PAID" | "FAILED";
  payeeName: string;
  payeeEmail: string;
  totalCreditsSpent: number;
  /** Gross earnings in cents (what's deducted from the creator's balance). */
  grossCents: number;
  /**
   * Portion of grossCents that is referral cash rewards (locked onto the
   * payout row at creation). Rendered as its own line item when positive;
   * omit or 0 for catalog-only payouts.
   */
  referralBonusCents?: number;
  /** Processing fee in cents, covered by the creator. */
  processingFeeCents: number;
  issuedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  paidAt: Date | null;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function renderPayoutInvoiceHtml(data: PayoutInvoiceData): string {
  const invoiceNumber = escapeHtml(data.invoiceNumber);
  const payeeName = escapeHtml(data.payeeName);
  const payeeEmail = escapeHtml(data.payeeEmail);
  const netCents = computeNetPayoutCents(data.grossCents, data.processingFeeCents);
  // Split the gross into catalog earnings + referral rewards. Clamped so a
  // malformed bonus can never push the catalog line negative.
  const referralCents = Math.min(
    Math.max(0, data.referralBonusCents ?? 0),
    data.grossCents
  );
  const catalogCents = data.grossCents - referralCents;
  const statusLabel =
    data.status === "PAID"
      ? "Paid"
      : data.status === "PENDING"
        ? "Pending approval"
        : "Rejected";
  const statusStyle =
    data.status === "PAID"
      ? "background:#e3f6e7;color:#1f7a30;"
      : data.status === "PENDING"
        ? "background:#fdf3d8;color:#8a6d1a;"
        : "background:#fde3e3;color:#a33;";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Invoice ${invoiceNumber} — Greenroom</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f4f5f4; color: #1a1a1a; padding: 40px 16px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet {
    max-width: 720px; margin: 0 auto; background: #fff; border-radius: 8px;
    box-shadow: 0 1px 4px rgba(0,0,0,.08); padding: 48px;
  }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .brand { font-size: 22px; font-weight: 800; letter-spacing: -.02em; }
  .brand span { color: #39b54a; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 15px; text-transform: uppercase; letter-spacing: .12em; color: #6b6b6b; font-weight: 600; }
  .doc-title .num { font-size: 18px; font-weight: 700; margin-top: 4px; }
  .status {
    display: inline-block; margin-top: 8px; padding: 3px 10px; border-radius: 999px;
    font-size: 12px; font-weight: 600; ${statusStyle}
  }
  .meta { display: flex; gap: 48px; margin-bottom: 36px; flex-wrap: wrap; }
  .meta h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #8a8a8a; margin-bottom: 6px; font-weight: 600; }
  .meta p { font-size: 14px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #8a8a8a; padding: 0 0 10px; border-bottom: 1px solid #e5e5e5; font-weight: 600; }
  th.r, td.r { text-align: right; }
  td { padding: 14px 0; font-size: 14px; border-bottom: 1px solid #efefef; vertical-align: top; }
  td .sub { color: #8a8a8a; font-size: 12px; margin-top: 2px; }
  .totals { margin-left: auto; width: 300px; margin-top: 8px; }
  .totals .row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
  .totals .row.fee { color: #6b6b6b; }
  .totals .row.net { border-top: 2px solid #1a1a1a; margin-top: 6px; padding-top: 12px; font-size: 16px; font-weight: 700; }
  .footnote { margin-top: 40px; font-size: 12px; color: #8a8a8a; line-height: 1.6; border-top: 1px solid #efefef; padding-top: 20px; }
  .actions { max-width: 720px; margin: 0 auto 16px; text-align: right; }
  .actions button {
    background: #39b54a; color: #06230c; border: 0; border-radius: 6px;
    padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { box-shadow: none; border-radius: 0; max-width: none; padding: 24px; }
    .actions { display: none; }
  }
</style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>
  <div class="sheet">
    <div class="top">
      <div class="brand">green<span>room</span></div>
      <div class="doc-title">
        <h1>Payout Invoice</h1>
        <div class="num">${invoiceNumber}</div>
        <span class="status">${statusLabel}</span>
      </div>
    </div>

    <div class="meta">
      <div>
        <h2>Payee</h2>
        <p><strong>${payeeName}</strong><br/>${payeeEmail}</p>
      </div>
      <div>
        <h2>Payer</h2>
        <p><strong>Greenroom</strong><br/>https://greenroom.app<br/>support@greenroom.app</p>
      </div>
      <div>
        <h2>Details</h2>
        <p>
          Issued: ${formatDate(data.issuedAt)}<br/>
          Period: ${formatDate(data.periodStart)} – ${formatDate(data.periodEnd)}
          ${data.paidAt ? `<br/>Paid: ${formatDate(data.paidAt)}` : ""}
        </p>
      </div>
    </div>

    <table>
      <thead>
        <tr><th>Description</th><th class="r">Amount</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>
            Creator earnings — ${data.totalCreditsSpent.toLocaleString("en-US")} credits
            <div class="sub">Sales of samples and presets during the invoice period</div>
          </td>
          <td class="r">${usd(catalogCents)}</td>
        </tr>
        ${
          referralCents > 0
            ? `<tr>
          <td>
            Referral rewards
            <div class="sub">Bonus for referred signups during the invoice period</div>
          </td>
          <td class="r">${usd(referralCents)}</td>
        </tr>
        `
            : ""
        }<tr>
          <td>
            Payment processing fee
            <div class="sub">Deducted from the payout — covered by the creator</div>
          </td>
          <td class="r">−${usd(data.processingFeeCents)}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Gross earnings</span><span>${usd(data.grossCents)}</span></div>
      <div class="row fee"><span>Processing fee</span><span>−${usd(data.processingFeeCents)}</span></div>
      <div class="row net"><span>Net payout</span><span>${usd(netCents)}</span></div>
    </div>

    <p class="footnote">
      Self-billed invoice generated by Greenroom on behalf of the payee for creator
      earnings on the Greenroom marketplace. Payment processing fees are covered by
      the creator and deducted from the gross payout. The net payout is sent via the
      payment method arranged with the Greenroom team. Questions? Contact
      support@greenroom.app and reference invoice ${invoiceNumber}.
    </p>
  </div>
</body>
</html>`;
}
