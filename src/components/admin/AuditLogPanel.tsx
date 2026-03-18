"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollText, Loader2, ChevronLeft, ChevronRight, User, FileAudio, CheckCircle, XCircle, Trash2, Edit } from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string | null;
  actor: {
    id: string;
    name: string;
  };
  createdAt: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  SAMPLE_APPROVED: <CheckCircle className="w-4 h-4 text-[#39b54a]" />,
  SAMPLE_REJECTED: <XCircle className="w-4 h-4 text-red-400" />,
  SAMPLE_DELETED: <Trash2 className="w-4 h-4 text-red-400" />,
  SAMPLE_EDITED: <Edit className="w-4 h-4 text-blue-400" />,
  APPLICATION_APPROVED: <CheckCircle className="w-4 h-4 text-[#39b54a]" />,
  APPLICATION_DENIED: <XCircle className="w-4 h-4 text-red-400" />,
};

const ACTION_LABELS: Record<string, string> = {
  SAMPLE_APPROVED: "Sample Approved",
  SAMPLE_REJECTED: "Sample Rejected",
  SAMPLE_DELETED: "Sample Deleted",
  SAMPLE_EDITED: "Sample Edited",
  APPLICATION_APPROVED: "Creator Approved",
  APPLICATION_DENIED: "Creator Denied",
};

export function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/audit-logs?limit=${limit}&offset=${offset}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
      }
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-[#39b54a]" />
          Audit Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-[#39b54a] animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-[#a1a1a1]">
            No audit logs yet
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 bg-[#0a0a0a] rounded-lg border border-[#2a2a2a]"
                >
                  <div className="mt-0.5">
                    {ACTION_ICONS[log.action] || <FileAudio className="w-4 h-4 text-[#a1a1a1]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm">
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                      <span className="text-[#666] text-xs">
                        {log.targetType} #{log.targetId.slice(0, 8)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <User className="w-3 h-3 text-[#666]" />
                      <span className="text-xs text-[#a1a1a1]">{log.actor.name}</span>
                      <span className="text-xs text-[#666]">•</span>
                      <span className="text-xs text-[#666]">{formatDate(log.createdAt)}</span>
                    </div>
                    {log.details && (
                      <div className="mt-2 text-xs text-[#666] bg-[#141414] rounded p-2 font-mono overflow-x-auto">
                        {log.details.length > 200 ? log.details.slice(0, 200) + "..." : log.details}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#2a2a2a]">
                <span className="text-xs text-[#a1a1a1]">
                  Page {currentPage} of {totalPages} ({total} total)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                    className="border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOffset(offset + limit)}
                    disabled={offset + limit >= total}
                    className="border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
