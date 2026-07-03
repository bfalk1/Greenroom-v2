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
