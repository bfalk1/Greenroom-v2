"use client";

import React, { useState } from "react";
import { Download, FileSpreadsheet, Loader2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const EXPORT_TYPES = [
  { id: "revenue", label: "Revenue Report", description: "Credit purchases & subscriptions" },
  { id: "downloads", label: "Download History", description: "All sample purchases" },
  { id: "users", label: "User List", description: "All registered users" },
  { id: "payouts", label: "Creator Payouts", description: "Payout history" },
  { id: "transactions", label: "Credit Transactions", description: "All credit movements" },
  { id: "samples", label: "Sample Catalog", description: "All uploaded samples" },
];

export function ExportPanel() {
  const [loading, setLoading] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const handleExport = async (type: string) => {
    setLoading(type);
    try {
      const params = new URLSearchParams({ type });
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);

      const res = await fetch(`/api/admin/export?${params.toString()}`);
      
      if (!res.ok) {
        throw new Error("Export failed");
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || `export_${type}.csv`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${type} data`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Export failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Export Data</h3>
        <p className="text-sm text-[#a1a1a1]">Download CSV reports for accounting and analysis</p>
      </div>

      {/* Date Range Filter */}
      <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-[#39b54a]" />
          <span className="text-sm font-medium text-white">Date Range (optional)</span>
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-[#666] mb-1">From</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-[#1a1a1a] border-[#2a2a2a] text-white"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-[#666] mb-1">To</label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-[#1a1a1a] border-[#2a2a2a] text-white"
            />
          </div>
          {(fromDate || toDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFromDate(""); setToDate(""); }}
              className="self-end text-[#a1a1a1] hover:text-white"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Export Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EXPORT_TYPES.map((exportType) => (
          <div
            key={exportType.id}
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-[#39b54a]" />
              <div>
                <h4 className="font-medium text-white">{exportType.label}</h4>
                <p className="text-xs text-[#a1a1a1]">{exportType.description}</p>
              </div>
            </div>
            <Button
              onClick={() => handleExport(exportType.id)}
              disabled={loading !== null}
              size="sm"
              className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
            >
              {loading === exportType.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </Button>
          </div>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="text-xs text-[#666] mt-4">
        💡 Exports include all data by default. Use date filters for specific periods.
      </div>
    </div>
  );
}
