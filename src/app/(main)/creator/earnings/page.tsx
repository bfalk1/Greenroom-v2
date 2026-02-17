"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DollarSign,
  TrendingUp,
  Download,
  ShoppingCart,
  Loader2,
  Wallet,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";
import { EarningsChart } from "@/components/creator/EarningsChart";

interface EarningsStats {
  totalEarnings: number;
  totalPurchases: number;
  totalDownloads: number;
  totalPaidOut: number;
  pendingPayout: number;
  unpaidEarnings: number;
}

interface Purchase {
  id: string;
  sampleId: string;
  sampleName: string;
  buyerUsername: string;
  creditsSpent: number;
  downloadCount: number;
  createdAt: string;
}

interface Payout {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalCreditsSpent: number;
  amountUsd: number;
  status: string;
  paidAt: string | null;
}

interface StripeConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted?: boolean;
  accountId: string | null;
}

export default function CreatorEarningsPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [stats, setStats] = useState<EarningsStats | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(
    null
  );
  const [connectingStripe, setConnectingStripe] = useState(false);

  const fetchEarnings = useCallback(async () => {
    try {
      const res = await fetch("/api/creator/earnings");
      if (!res.ok) throw new Error("Failed to fetch earnings");
      const data = await res.json();
      setStats(data.stats);
      setPurchases(data.purchases);
      setPayouts(data.payouts);
    } catch (error) {
      console.error("Error fetching earnings:", error);
      toast.error("Failed to load earnings data");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStripeStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/creator/stripe-connect");
      if (!res.ok) throw new Error("Failed to check Stripe status");
      const data = await res.json();
      setStripeStatus(data);
    } catch (error) {
      console.error("Error checking Stripe status:", error);
    }
  }, []);

  const handleConnectStripe = async () => {
    setConnectingStripe(true);
    try {
      const res = await fetch("/api/creator/stripe-connect", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start Stripe onboarding");
      }
      // Redirect to Stripe onboarding
      window.location.href = data.url;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to connect Stripe"
      );
      setConnectingStripe(false);
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
      toast.success(
        "Payout request submitted! An admin will review it shortly."
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
      fetchStripeStatus();
    } else if (!userLoading) {
      setLoading(false);
    }
  }, [user, userLoading, fetchEarnings, fetchStripeStatus]);

  if (userLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00FF88] animate-spin" />
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
            className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
          >
            Apply Now
          </Button>
        </div>
      </div>
    );
  }

  const stripeReady =
    stripeStatus?.connected && stripeStatus?.chargesEnabled;
  const stripePartial =
    stripeStatus?.connected && !stripeStatus?.chargesEnabled;
  const canRequestPayout =
    stripeReady &&
    stats &&
    stats.unpaidEarnings - stats.pendingPayout > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-white mb-8">
          Creator Earnings
        </h1>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#00FF88]/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-[#00FF88]" />
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
            <p className="text-[#a1a1a1] text-xs mt-2">Sample purchases</p>
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
            <p className="text-[#a1a1a1] text-xs mt-2">Across all samples</p>
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

        {/* Stripe Connect + Payout Request */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 mb-8">
          {!stripeStatus || !stripeStatus.connected ? (
            /* Stripe not connected */
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-400" />
                  Connect Stripe to Get Paid
                </h2>
                <p className="text-[#a1a1a1] text-sm">
                  Set up your Stripe account to receive payouts directly to your
                  bank. This only takes a few minutes.
                </p>
              </div>
              <Button
                onClick={handleConnectStripe}
                disabled={connectingStripe}
                className="bg-[#635bff] text-white hover:bg-[#5349e0] shrink-0"
              >
                {connectingStripe ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Connect Stripe
              </Button>
            </div>
          ) : stripePartial ? (
            /* Stripe connected but not fully set up */
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-400" />
                  Finish Stripe Setup
                </h2>
                <p className="text-[#a1a1a1] text-sm">
                  Your Stripe account is connected but not fully verified.
                  Please complete the onboarding to enable payouts.
                </p>
              </div>
              <Button
                onClick={handleConnectStripe}
                disabled={connectingStripe}
                className="bg-[#635bff] text-white hover:bg-[#5349e0] shrink-0"
              >
                {connectingStripe ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Complete Setup
              </Button>
            </div>
          ) : (
            /* Stripe fully connected — show payout request */
            <div>
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 text-[#00FF88]" />
                <span className="text-sm text-[#00FF88] font-medium">
                  Stripe connected
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white mb-1">
                    Request Payout
                  </h2>
                  <p className="text-[#a1a1a1] text-sm">
                    {stats &&
                    stats.unpaidEarnings - stats.pendingPayout > 0 ? (
                      <>
                        You have{" "}
                        <span className="text-[#00FF88] font-medium">
                          $
                          {(
                            stats.unpaidEarnings - stats.pendingPayout
                          ).toFixed(2)}
                        </span>{" "}
                        available for payout.
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
                        Minimum payout is $0.01 (testing mode). Current unpaid earnings:{" "}
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
                  className="bg-[#00FF88] text-black hover:bg-[#00cc6a] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
          )}
        </div>

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
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Paid
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
                      <td className="px-6 py-4 text-white text-sm font-medium">
                        ${payout.amountUsd.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            payout.status === "PAID"
                              ? "bg-[#00FF88]/20 text-[#00FF88]"
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

        {/* Recent Purchases Table */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden">
          <div className="p-6 border-b border-[#2a2a2a]">
            <h2 className="text-lg font-semibold text-white">
              Recent Purchases
            </h2>
          </div>

          {purchases.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2a2a2a]">
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Sample
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Buyer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Credits
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Downloads
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#a1a1a1] uppercase">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <tr
                      key={purchase.id}
                      className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a]/50"
                    >
                      <td className="px-6 py-4 text-white text-sm font-medium">
                        {purchase.sampleName}
                      </td>
                      <td className="px-6 py-4 text-[#a1a1a1] text-sm">
                        {purchase.buyerUsername}
                      </td>
                      <td className="px-6 py-4 text-white text-sm">
                        {purchase.creditsSpent}
                      </td>
                      <td className="px-6 py-4 text-white text-sm">
                        {purchase.downloadCount}
                      </td>
                      <td className="px-6 py-4 text-[#a1a1a1] text-sm">
                        {new Date(purchase.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <TrendingUp className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
              <p className="text-[#a1a1a1]">
                No purchases yet. Upload samples to start earning!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
