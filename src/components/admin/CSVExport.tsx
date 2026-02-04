"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Download, FileText } from "lucide-react";

export function CSVExport() {
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExportPayouts = async () => {
    try {
      setExporting("payouts");
      // TODO: Replace with Supabase/Prisma call
      alert("Export payouts coming soon!");
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export payouts");
    } finally {
      setExporting(null);
    }
  };

  const handleExportDownloads = async () => {
    try {
      setExporting("downloads");
      // TODO: Replace with Supabase/Prisma call
      alert("Export downloads coming soon!");
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export downloads");
    } finally {
      setExporting(null);
    }
  };

  const handleExportRevenue = async () => {
    try {
      setExporting("revenue");
      // TODO: Replace with Supabase/Prisma call
      alert("Export revenue coming soon!");
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export revenue");
    } finally {
      setExporting(null);
    }
  };

  return (
    <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <FileText className="w-5 h-5" />
          CSV Data Exports
        </CardTitle>
        <CardDescription className="text-[#a1a1a1]">
          Export platform data for analysis and reporting
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button
            onClick={handleExportPayouts}
            disabled={exporting === "payouts"}
            className="bg-[#2a2a2a] text-white hover:bg-[#3a3a3a] h-auto py-4 flex flex-col items-center gap-2"
          >
            <Download className="w-5 h-5" />
            <span>
              {exporting === "payouts" ? "Exporting..." : "Export Payouts"}
            </span>
          </Button>

          <Button
            onClick={handleExportDownloads}
            disabled={exporting === "downloads"}
            className="bg-[#2a2a2a] text-white hover:bg-[#3a3a3a] h-auto py-4 flex flex-col items-center gap-2"
          >
            <Download className="w-5 h-5" />
            <span>
              {exporting === "downloads"
                ? "Exporting..."
                : "Export Downloads"}
            </span>
          </Button>

          <Button
            onClick={handleExportRevenue}
            disabled={exporting === "revenue"}
            className="bg-[#2a2a2a] text-white hover:bg-[#3a3a3a] h-auto py-4 flex flex-col items-center gap-2"
          >
            <Download className="w-5 h-5" />
            <span>
              {exporting === "revenue" ? "Exporting..." : "Export Revenue"}
            </span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
