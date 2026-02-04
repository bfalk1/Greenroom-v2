"use client";

import React, { useState } from "react";
import { DollarSign, TrendingUp, Download, ShoppingCart } from "lucide-react";

interface Purchase {
  id: string;
  sample_id: string;
  user_id: string;
  credits_spent: number;
  download_count: number;
  created_date: string;
}

const MOCK_PURCHASES: Purchase[] = [
  {
    id: "p1",
    sample_id: "s1",
    user_id: "u1",
    credits_spent: 3,
    download_count: 2,
    created_date: "2024-01-15T12:00:00Z",
  },
  {
    id: "p2",
    sample_id: "s2",
    user_id: "u2",
    credits_spent: 5,
    download_count: 1,
    created_date: "2024-01-14T12:00:00Z",
  },
];

export default function CreatorEarningsPage() {
  const [purchases] = useState<Purchase[]>(MOCK_PURCHASES);

  const stats = {
    totalEarnings: purchases
      .reduce((sum, p) => sum + p.credits_spent * 0.03, 0)
      .toFixed(2),
    totalPurchases: purchases.length,
    totalDownloads: purchases.reduce(
      (sum, p) => sum + (p.download_count || 0),
      0
    ),
    pendingPayout: purchases
      .reduce((sum, p) => sum + p.credits_spent * 0.03, 0)
      .toFixed(2),
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-white mb-8">Creator Earnings</h1>

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
              ${stats.totalEarnings}
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
              {stats.totalPurchases}
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
              {stats.totalDownloads}
            </p>
            <p className="text-[#a1a1a1] text-xs mt-2">Across all samples</p>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-[#a1a1a1] text-sm font-medium">
                Pending Payout
              </h3>
            </div>
            <p className="text-3xl font-bold text-white">
              ${stats.pendingPayout}
            </p>
            <p className="text-[#a1a1a1] text-xs mt-2">Ready to withdraw</p>
          </div>
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
                      Credits Spent
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
                      <td className="px-6 py-4 text-white text-sm">
                        {purchase.sample_id}
                      </td>
                      <td className="px-6 py-4 text-[#a1a1a1] text-sm">
                        {purchase.user_id}
                      </td>
                      <td className="px-6 py-4 text-white text-sm font-medium">
                        {purchase.credits_spent}
                      </td>
                      <td className="px-6 py-4 text-white text-sm">
                        {purchase.download_count || 0}
                      </td>
                      <td className="px-6 py-4 text-[#a1a1a1] text-sm">
                        {new Date(purchase.created_date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
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
