-- Date-range aggregation indexes for the admin analytics dashboard: the
-- ledger/purchase/download tables were only indexed per-user, so global
-- created_at range scans (KPIs, sparkline buckets) would table-scan.
CREATE INDEX "credit_transactions_created_at_idx" ON "credit_transactions"("created_at");
CREATE INDEX "purchases_created_at_idx" ON "purchases"("created_at");
CREATE INDEX "downloads_created_at_idx" ON "downloads"("created_at");
