import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPayoutInvoiceHtml, escapeHtml, PayoutInvoiceData } from "./payoutInvoice";

const baseInvoice: PayoutInvoiceData = {
  invoiceNumber: "GR-2026-000042",
  status: "PENDING",
  payeeName: "DJ Test",
  payeeEmail: "dj@example.com",
  totalCreditsSpent: 715,
  grossCents: 5005, // 715 credits × 7¢
  processingFeeCents: 176, // ceil(5005 × 2.9%) + 30¢
  issuedAt: new Date(Date.UTC(2026, 6, 2)),
  periodStart: new Date(Date.UTC(2026, 5, 1)),
  periodEnd: new Date(Date.UTC(2026, 6, 1)),
  paidAt: null,
};

test("invoice shows gross, creator-covered fee, and net payout", () => {
  const html = renderPayoutInvoiceHtml(baseInvoice);
  assert.ok(html.includes("GR-2026-000042"));
  assert.ok(html.includes("$50.05")); // gross
  assert.ok(html.includes("−$1.76")); // fee, shown as a deduction
  assert.ok(html.includes("$48.29")); // net = 5005 − 176
  assert.ok(html.includes("Net payout"));
  assert.ok(html.includes("covered by the creator"));
  assert.ok(html.includes("Pending approval"));
  // Not yet paid → no Paid: line
  assert.ok(!html.includes("Paid:"));
});

test("paid invoices show the paid date and status", () => {
  const html = renderPayoutInvoiceHtml({
    ...baseInvoice,
    status: "PAID",
    paidAt: new Date(Date.UTC(2026, 6, 3)),
  });
  assert.ok(html.includes(">Paid<"));
  assert.ok(html.includes("Paid: July 3, 2026"));
});

test("user-controlled fields are HTML-escaped (no script injection)", () => {
  const html = renderPayoutInvoiceHtml({
    ...baseInvoice,
    payeeName: '<script>alert("xss")</script>',
    payeeEmail: '"><img src=x onerror=alert(1)>',
  });
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("escapeHtml covers the five HTML metacharacters", () => {
  assert.equal(
    escapeHtml(`&<>"'`),
    "&amp;&lt;&gt;&quot;&#39;"
  );
});

test("referral bonus renders as its own line and is split out of catalog earnings", () => {
  const html = renderPayoutInvoiceHtml({
    ...baseInvoice,
    grossCents: 5705, // 5005 catalog + 700 referral
    referralBonusCents: 700,
  });
  assert.ok(html.includes("Referral rewards"));
  assert.ok(html.includes("$7.00")); // the referral line
  assert.ok(html.includes("$50.05")); // catalog line = gross − bonus
  assert.ok(html.includes("$57.05")); // gross total unchanged
});

test("catalog-only invoices (bonus absent or 0) render no referral line", () => {
  assert.ok(!renderPayoutInvoiceHtml(baseInvoice).includes("Referral rewards"));
  assert.ok(
    !renderPayoutInvoiceHtml({ ...baseInvoice, referralBonusCents: 0 }).includes(
      "Referral rewards"
    )
  );
});

test("a malformed bonus larger than gross is clamped, never a negative catalog line", () => {
  const html = renderPayoutInvoiceHtml({
    ...baseInvoice,
    grossCents: 500,
    referralBonusCents: 9999,
  });
  assert.ok(html.includes("Referral rewards"));
  assert.ok(!html.includes("$-")); // no negative amounts anywhere
  assert.ok(!html.includes("−$-"));
});

test("zero-fee invoices render a $0.00 deduction and net equals gross", () => {
  const html = renderPayoutInvoiceHtml({
    ...baseInvoice,
    grossCents: 5000,
    processingFeeCents: 0,
  });
  assert.ok(html.includes("−$0.00"));
  // Net payout row shows the full gross
  const netRow = html.split("Net payout")[1];
  assert.ok(netRow.includes("$50.00"));
});
