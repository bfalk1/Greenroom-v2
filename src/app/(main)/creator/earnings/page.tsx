"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DollarSign,
  TrendingUp,
  Download,
  FileText,
  ShoppingCart,
  Loader2,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";
import { EarningsChart } from "@/components/creator/EarningsChart";
import { PayoutProgress } from "@/components/creator/PayoutProgress";
import { ReferralPanel } from "@/components/referral/ReferralPanel";

interface EarningsStats {
  totalEarnings: number;
  totalPurchases: number;
  totalDownloads: number;
  totalPaidOut: number;
  pendingPayout: number;
  unpaidEarnings: number;
  thisMonthEarnings?: number;
  /** Non-catalog earnings — they show in Total Earnings but not in the table. */
  referralEarnings?: number;
  adjustmentEarnings?: number;
}

// Minimum payout threshold — keep in sync with MIN_PAYOUT_CENTS in lib/payoutMath.ts
const PAYOUT_THRESHOLD = 50.0;

// Display-only mirror of computeProcessingFeeCents in lib/payoutMath.ts — the
// server recomputes and locks the authoritative fee when the payout is created.
function estimateFeeUsd(grossUsd: number, cfg: PayoutFeeConfig | null): number {
  if (!cfg || grossUsd <= 0) return 0;
  const grossCents = Math.round(grossUsd * 100);
  const feeCents = Math.min(
    grossCents,
    Math.ceil((grossCents * cfg.payoutFeeBps) / 10000) + cfg.payoutFeeFixedCents
  );
  return feeCents / 100;
}

function formatFeeConfig(cfg: PayoutFeeConfig): string {
  const pct = parseFloat((cfg.payoutFeeBps / 100).toFixed(2));
  const fixed = (cfg.payoutFeeFixedCents / 100).toFixed(2);
  return `${pct}% + $${fixed}`;
}

/** One sample or preset in the creator's catalog, with what it has earned. */
interface CatalogItem {
  id: string;
  type: "SAMPLE" | "PRESET";
  name: string;
  creditPrice: number;
  status: string;
  purchases: number;
  credits: number;
  downloads: number;
  earningsUsd: number;
  createdAt: string;
}

type CatalogSortKey = "purchases" | "downloads" | "credits" | "earningsUsd" | "name";

/** How many rows the performance table shows before "Show all". */
const CATALOG_PAGE_SIZE = 25;

interface Payout {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalCreditsSpent: number;
  amountUsd: number;
  processingFeeUsd: number;
  netAmountUsd: number;
  invoiceNumber: string | null;
  status: string;
  paidAt: string | null;
}

interface PayoutFeeConfig {
  payoutFeeBps: number;
  payoutFeeFixedCents: number;
}

export default function CreatorEarningsPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [stats, setStats] = useState<EarningsStats | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [sortBy, setSortBy] = useState<CatalogSortKey>("purchases");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showAllCatalog, setShowAllCatalog] = useState(false);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [feeConfig, setFeeConfig] = useState<PayoutFeeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestingPayout, setRequestingPayout] = useState(false);
  // PayPal address payouts are sent to. `paypalEmail` is what's saved on the
  // account; `paypalInput` is the draft in the field.
  const [paypalEmail, setPaypalEmail] = useState<string | null>(null);
  const [paypalInput, setPaypalInput] = useState("");
  const [savingPaypal, setSavingPaypal] = useState(false);

  const fetchEarnings = useCallback(async () => {
    try {
      const res = await fetch("/api/creator/earnings");
      if (!res.ok) throw new Error("Failed to fetch earnings");
      const data = await res.json();
      setStats(data.stats);
      setCatalog(data.catalog ?? []);
      setPayouts(data.payouts);
      if (data.payoutInfo) {
        setFeeConfig({
          payoutFeeBps: data.payoutInfo.payoutFeeBps ?? 0,
          payoutFeeFixedCents: data.payoutInfo.payoutFeeFixedCents ?? 0,
        });
        const saved: string | null = data.payoutInfo.paypalEmail ?? null;
        setPaypalEmail(saved);
        setPaypalInput(saved ?? "");
      }
    } catch (error) {
      console.error("Error fetching earnings:", error);
      toast.error("Failed to load earnings data");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSavePaypalEmail = async () => {
    const value = paypalInput.trim();
    if (!value) {
      toast.error("Enter the PayPal email you want payouts sent to.");
      return;
    }
    setSavingPaypal(true);
    try {
      const res = await fetch("/api/creator/payout-method", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paypalEmail: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save PayPal email");
      }
      setPaypalEmail(data.paypalEmail);
      setPaypalInput(data.paypalEmail);
      toast.success(`Payouts will be sent to ${data.paypalEmail}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save PayPal email"
      );
    } finally {
      setSavingPaypal(false);
    }
  };

  const handleRequestPayout = async () => {
    setRequestingPayout(true);
    try {
      const res = await fetch("/api/creator/payouts", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to request payout");
      }
      const inv = data.payout?.invoiceNumber;
      const net = data.payout?.netAmountUsd;
      toast.success(
        `Payout request submitted!${inv ? ` Invoice ${inv} generated.` : ""}${
          typeof net === "number"
            ? ` You'll receive $${net.toFixed(2)} after processing fees.`
            : ""
        } An admin will review it shortly.`
      );
      await fetchEarnings();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to request payout"
      );
    } finally {
      setRequestingPayout(false);
    }
  };

  useEffect(() => {
    if (user && (user.role === "CREATOR" || user.role === "ADMIN")) {
      fetchEarnings();
    } else if (!userLoading) {
      setLoading(false);
    }
  }, [user, userLoading, fetchEarnings]);

  if (userLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
      </div>
    );
  }

  if (!user || (user.role !== "CREATOR" && user.role !== "ADMIN")) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">
            Creator Access Required
          </h2>
          <p className="text-[#a1a1a1] mb-4">
            Apply to become a creator to view earnings.
          </p>
          <Button
            onClick={() => router.push("/creator/apply")}
            className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
          >
            Apply Now
          </Button>
        </div>
      </div>
    );
  }

  // ---- Sample performance table ----
  const sortedCatalog = [...catalog].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "name") return dir * a.name.localeCompare(b.name);
    const diff = a[sortBy] - b[sortBy];
    return diff !== 0 ? dir * diff : a.name.localeCompare(b.name);
  });
  const visibleCatalog = showAllCatalog
    ? sortedCatalog
    : sortedCatalog.slice(0, CATALOG_PAGE_SIZE);
  const soldCount = catalog.filter((i) => i.purchases > 0).length;
  const hasNonCatalogEarnings =
    (stats?.referralEarnings ?? 0) > 0 || (stats?.adjustmentEarnings ?? 0) > 0;
  // Totals cover the WHOLE catalog, not just the visible rows, so they
  // reconcile with the stat cards above.
  const catalogTotals = catalog.reduce(
    (acc, i) => ({
      purchases: acc.purchases + i.purchases,
      downloads: acc.downloads + i.downloads,
      credits: acc.credits + i.credits,
      earningsUsd: acc.earningsUsd + i.earningsUsd,
    }),
    { purchases: 0, downloads: 0, credits: 0, earningsUsd: 0 }
  );

  const toggleCatalogSort = (key: CatalogSortKey) => {
    if (key === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const catalogSortHeader = (
    key: CatalogSortKey,
    label: string,
    align: "left" | "right" = "right"
  ) => (
    <th
      className={`px-6 py-3 text-xs font-medium uppercase ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      <button
        onClick={() => toggleCatalogSort(key)}
        className={`inline-flex items-center gap-1 transition ${
          sortBy === key
            ? "text-[#39b54a]"
            : "text-[#a1a1a1] hover:text-white"
        }`}
      >
        {label}
        {sortBy === key &&
          (sortDir === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          ))}
      </button>
    </th>
  );

  const hasPayoutMethod = Boolean(paypalEmail);
  const meetsThreshold = Boolean(
    stats && stats.unpaidEarnings - stats.pendingPayout >= PAYOUT_THRESHOLD
  );
  // A payout can't be requested without somewhere to send it — the server
  // enforces the same rule, this just keeps the button honest.
  const canRequestPayout = meetsThreshold && hasPayoutMethod;
  const paypalDirty = paypalInput.trim() !== (paypalEmail ?? "");

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-white mb-8">
          Creator Earnings
        </h1>

        {/* Payout Progress */}
        <div className="mb-8">
          <PayoutProgress
            currentEarnings={stats?.unpaidEarnings ?? 0}
            threshold={PAYOUT_THRESHOLD}
            estimatedMonthlyRevenue={stats?.thisMonthEarnings ?? stats?.unpaidEarnings ?? 0}
            availableBalance={(stats?.unpaidEarnings ?? 0) - (stats?.pendingPayout ?? 0)}
            pendingPayout={stats?.pendingPayout ?? 0}
          />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#39b54a]/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-[#39b54a]" />
              </div>
              <h3 className="text-[#a1a1a1] text-sm font-medium">
                Total Earnings
              </h3>
            </div>
            <p className="text-3xl font-bold text-white">
              ${stats?.totalEarnings.toFixed(2) ?? "0.00"}
            </p>
            <p className="text-[#a1a1a1] text-xs mt-2">Lifetime earnings</p>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-[#a1a1a1] text-sm font-medium">
                Total Purchases
              </h3>
            </div>
            <p className="text-3xl font-bold text-white">
              {stats?.totalPurchases ?? 0}
            </p>
            <p className="text-[#a1a1a1] text-xs mt-2">Samples + presets</p>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Download className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-[#a1a1a1] text-sm font-medium">
                Total Downloads
              </h3>
            </div>
            <p className="text-3xl font-bold text-white">
              {stats?.totalDownloads ?? 0}
            </p>
            <p className="text-[#a1a1a1] text-xs mt-2">Across your catalog</p>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-[#a1a1a1] text-sm font-medium">
                Unpaid Earnings
              </h3>
            </div>
            <p className="text-3xl font-bold text-white">
              ${stats?.unpaidEarnings.toFixed(2) ?? "0.00"}
            </p>
            <p className="text-[#a1a1a1] text-xs mt-2">Ready to withdraw</p>
          </div>
        </div>

        {/* Payout Method — where the money is sent. Required before payout. */}
        <div
          className={`bg-[#1a1a1a] border rounded-lg p-6 mb-8 ${
            hasPayoutMethod ? "border-[#2a2a2a]" : "border-yellow-500/40"
          }`}
        >
          <div className="flex items-start gap-3 mb-1">
            {hasPayoutMethod ? (
              <CheckCircle2 className="w-5 h-5 text-[#39b54a] shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            )}
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">
                PayPal Email
              </h2>
              <p className="text-[#a1a1a1] text-sm">
                {hasPayoutMethod ? (
                  <>
                    Payouts are sent to{" "}
                    <span className="text-white font-medium">{paypalEmail}</span>
                    . Make sure it&apos;s an address you can receive money at.
                  </>
                ) : (
                  <>
                    Add the PayPal email you want your money sent to. You
                    can&apos;t request or receive a payout until this is set.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={paypalInput}
              onChange={(e) => setPaypalInput(e.target.value)}
              placeholder="you@example.com"
              aria-label="PayPal email"
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
            />
            <Button
              onClick={handleSavePaypalEmail}
              disabled={savingPaypal || !paypalDirty || !paypalInput.trim()}
              className="bg-[#39b54a] text-black hover:bg-[#2e9140] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {savingPaypal && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {hasPayoutMethod ? "Update" : "Save"}
            </Button>
          </div>
        </div>

        {/* Payout Request */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">
                Request Payout
              </h2>
              <p className="text-[#a1a1a1] text-sm">
                {canRequestPayout && stats ? (
                  <>
                    You have{" "}
                    <span className="text-[#39b54a] font-medium">
                      $
                      {(
                        stats.unpaidEarnings - stats.pendingPayout
                      ).toFixed(2)}
                    </span>{" "}
                    available for payout. Requests are reviewed and paid out
                    manually by the Greenroom team.
                    {feeConfig &&
                      (feeConfig.payoutFeeBps > 0 ||
                        feeConfig.payoutFeeFixedCents > 0) && (
                        <>
                          {" "}
                          A payment processing fee of{" "}
                          {formatFeeConfig(feeConfig)} is deducted — you&apos;ll
                          receive about{" "}
                          <span className="text-white font-medium">
                            $
                            {(
                              stats.unpaidEarnings -
                              stats.pendingPayout -
                              estimateFeeUsd(
                                stats.unpaidEarnings - stats.pendingPayout,
                                feeConfig
                              )
                            ).toFixed(2)}
                          </span>
                          . An invoice is generated with your request.
                        </>
                      )}
                  </>
                ) : meetsThreshold && !hasPayoutMethod && stats ? (
                  <>
                    You have{" "}
                    <span className="text-[#39b54a] font-medium">
                      ${(stats.unpaidEarnings - stats.pendingPayout).toFixed(2)}
                    </span>{" "}
                    ready, but no payout destination.{" "}
                    <span className="text-yellow-400">
                      Add your PayPal email above
                    </span>{" "}
                    to request it.
                  </>
                ) : stats && stats.pendingPayout > 0 ? (
                  <>
                    You have a pending payout of{" "}
                    <span className="text-yellow-400 font-medium">
                      ${stats.pendingPayout.toFixed(2)}
                    </span>
                    . Please wait for admin approval.
                  </>
                ) : (
                  <>
                    Minimum payout is ${PAYOUT_THRESHOLD.toFixed(2)}. Current unpaid earnings:{" "}
                    <span className="text-white font-medium">
                      ${stats?.unpaidEarnings.toFixed(2) ?? "0.00"}
                    </span>
                  </>
                )}
              </p>
            </div>
            <Button
              onClick={handleRequestPayout}
              disabled={requestingPayout || !canRequestPayout}
              className="bg-[#39b54a] text-black hover:bg-[#2e9140] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {requestingPayout ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <DollarSign className="w-4 h-4 mr-2" />
              )}
              Request Payout
            </Button>
          </div>
        </div>

        {/* Invite Friends (referral link — creators earn payout cash) */}
        <ReferralPanel variant="creator" />

        {/* Payouts History */}
        {payouts.length > 0 && (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden mb-8">
            <div className="p-6 border-b border-[#2a2a2a]">
              <h2 className="text-lg font-semibold text-white">
                Payout History
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2a2a2a]">
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Period
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Credits
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Fee
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      You Receive
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Paid
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-[#a1a1a1] uppercase">
                      Invoice
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((payout) => (
                    <tr
                      key={payout.id}
                      className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a]/50"
                    >
                      <td className="px-6 py-4 text-white text-sm">
                        {new Date(payout.periodStart).toLocaleDateString()} –{" "}
                        {new Date(payout.periodEnd).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-white text-sm">
                        {payout.totalCreditsSpent}
                      </td>
                      <td className="px-6 py-4 text-white text-sm">
                        ${payout.amountUsd.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-[#a1a1a1] text-sm">
                        {payout.processingFeeUsd > 0
                          ? `−$${payout.processingFeeUsd.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-[#39b54a] text-sm font-medium">
                        ${payout.netAmountUsd.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            payout.status === "PAID"
                              ? "bg-[#39b54a]/20 text-[#39b54a]"
                              : payout.status === "PENDING"
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {payout.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[#a1a1a1] text-sm">
                        {payout.paidAt
                          ? new Date(payout.paidAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <a
                          href={`/api/creator/payouts/${payout.id}/invoice`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={payout.invoiceNumber ?? "View invoice"}
                          className="text-[#39b54a] hover:text-[#2e9140] text-sm inline-flex items-center justify-end gap-1"
                        >
                          <FileText className="w-4 h-4" />
                          {payout.invoiceNumber ?? "View"}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Earnings Chart */}
        <div className="mb-8">
          <EarningsChart />
        </div>

        {/* Per-sample performance — what each upload actually sold and earned,
            best sellers first. Replaces the old buyer-by-buyer purchase log,
            which said nothing about which uploads are worth making more of. */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden">
          <div className="p-6 border-b border-[#2a2a2a] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Sample Performance
              </h2>
              <p className="text-[#a1a1a1] text-sm mt-1">
                Every sample and preset you&apos;ve uploaded, ranked by sales.
              </p>
            </div>
            {catalog.length > 0 && (
              <span className="text-xs text-[#666]">
                {catalog.length} upload{catalog.length === 1 ? "" : "s"} ·{" "}
                {soldCount} with sales
              </span>
            )}
          </div>

          {catalog.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#2a2a2a]">
                      <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase w-10">
                        #
                      </th>
                      {catalogSortHeader("name", "Item", "left")}
                      <th className="px-6 py-3 text-right text-xs font-medium text-[#a1a1a1] uppercase">
                        Price
                      </th>
                      {catalogSortHeader("purchases", "Purchases")}
                      {catalogSortHeader("downloads", "Downloads")}
                      {catalogSortHeader("credits", "Credits")}
                      {catalogSortHeader("earningsUsd", "Earned")}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCatalog.map((item, i) => (
                      <tr
                        key={item.id}
                        className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a]/50"
                      >
                        <td className="px-6 py-4 text-[#666] text-sm tabular-nums">
                          {i + 1}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-medium">
                              {item.name}
                            </span>
                            {item.type === "PRESET" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#2a2a2a] text-[#a1a1a1] uppercase shrink-0">
                                Preset
                              </span>
                            )}
                            {item.status !== "PUBLISHED" && (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase shrink-0 ${
                                  item.status === "REVIEW"
                                    ? "bg-yellow-500/20 text-yellow-400"
                                    : item.status === "REMOVED"
                                      ? "bg-red-500/20 text-red-400"
                                      : "bg-[#2a2a2a] text-[#a1a1a1]"
                                }`}
                              >
                                {item.status === "REMOVED" ? "Removed" : item.status}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-[#a1a1a1] text-sm tabular-nums">
                          {item.creditPrice}
                        </td>
                        <td className="px-6 py-4 text-right text-white text-sm tabular-nums">
                          {item.purchases}
                        </td>
                        <td className="px-6 py-4 text-right text-white text-sm tabular-nums">
                          {item.downloads}
                        </td>
                        <td className="px-6 py-4 text-right text-[#a1a1a1] text-sm tabular-nums">
                          {item.credits}
                        </td>
                        <td className="px-6 py-4 text-right text-[#39b54a] text-sm font-medium tabular-nums">
                          ${item.earningsUsd.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#141414]">
                      <td />
                      <td className="px-6 py-4 text-[#a1a1a1] text-xs uppercase font-medium">
                        Total
                      </td>
                      <td />
                      <td className="px-6 py-4 text-right text-white text-sm font-medium tabular-nums">
                        {catalogTotals.purchases}
                      </td>
                      <td className="px-6 py-4 text-right text-white text-sm font-medium tabular-nums">
                        {catalogTotals.downloads}
                      </td>
                      <td className="px-6 py-4 text-right text-[#a1a1a1] text-sm font-medium tabular-nums">
                        {catalogTotals.credits}
                      </td>
                      <td className="px-6 py-4 text-right text-[#39b54a] text-sm font-medium tabular-nums">
                        ${catalogTotals.earningsUsd.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {catalog.length > CATALOG_PAGE_SIZE && (
                <div className="p-4 border-t border-[#2a2a2a] text-center">
                  <button
                    onClick={() => setShowAllCatalog((v) => !v)}
                    className="text-sm text-[#39b54a] hover:text-[#2e9140] font-medium"
                  >
                    {showAllCatalog
                      ? `Show top ${CATALOG_PAGE_SIZE}`
                      : `Show all ${catalog.length} uploads`}
                  </button>
                </div>
              )}

              {/* Catalog sales are only one component of the balance above —
                  say so, or the totals look like they don't add up. */}
              {hasNonCatalogEarnings && (
                <p className="px-6 pb-5 text-xs text-[#666]">
                  Sales only. Referral rewards and bonuses are included in Total
                  Earnings above, not in this table.
                </p>
              )}
            </>
          ) : (
            <div className="p-12 text-center">
              <TrendingUp className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
              <p className="text-[#a1a1a1]">
                Nothing uploaded yet. Upload samples to start earning!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
