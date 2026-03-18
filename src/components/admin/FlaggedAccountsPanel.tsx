"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Flag,
  User,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Ban,
  Music,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";

interface FlaggedUser {
  id: string;
  email: string;
  username: string | null;
  artistName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
  isFlagged: boolean;
  flagReason: string | null;
  flaggedAt: string | null;
  flaggedBy: string | null;
  isActive: boolean;
  createdAt: string;
  flagger: {
    id: string;
    username: string | null;
    artistName: string | null;
    fullName: string | null;
  } | null;
  _count: {
    samples: number;
    purchases: number;
  };
}

export function FlaggedAccountsPanel() {
  const [users, setUsers] = useState<FlaggedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchFlagged = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/flagged");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error("Failed to fetch flagged users:", error);
      toast.error("Failed to load flagged accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlagged();
  }, [fetchFlagged]);

  const handleAction = async (userId: string, action: "unflag" | "suspend") => {
    const confirmed = window.confirm(
      action === "unflag"
        ? "Remove flag from this account?"
        : "Suspend this account? The user will not be able to access their account."
    );
    if (!confirmed) return;

    setProcessingId(userId);
    try {
      const res = await fetch("/api/admin/flagged", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });

      if (!res.ok) {
        throw new Error("Failed to process action");
      }

      toast.success(
        action === "unflag"
          ? "Account unflagged"
          : "Account suspended"
      );
      fetchFlagged();
    } catch (error) {
      toast.error("Failed to process action");
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="w-12 h-12 text-[#39b54a] mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No Flagged Accounts</h3>
        <p className="text-[#a1a1a1]">
          All accounts are in good standing
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <AlertTriangle className="w-5 h-5 text-yellow-400" />
        <h3 className="text-lg font-semibold text-white">
          Flagged Accounts ({users.length})
        </h3>
      </div>

      {users.map((user) => (
        <div
          key={user.id}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6"
        >
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-yellow-400" />
              )}
            </div>

            {/* User Info */}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-white font-semibold">
                  {user.artistName || user.fullName || user.username || "Unknown"}
                </h4>
                <span className="px-2 py-0.5 rounded-full text-xs bg-[#2a2a2a] text-[#a1a1a1] capitalize">
                  {user.role.toLowerCase()}
                </span>
                {!user.isActive && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">
                    Suspended
                  </span>
                )}
              </div>
              <p className="text-sm text-[#a1a1a1]">{user.email}</p>

              {/* Flag Info */}
              <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <Flag className="w-4 h-4 text-yellow-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-yellow-400 font-medium">
                      {user.flagReason || "No reason provided"}
                    </p>
                    <p className="text-xs text-[#a1a1a1] mt-1">
                      Flagged on {new Date(user.flaggedAt || "").toLocaleDateString()}
                      {user.flagger && (
                        <> by {user.flagger.artistName || user.flagger.username || "Unknown"}</>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 mt-3 text-sm text-[#a1a1a1]">
                <span className="flex items-center gap-1">
                  <Music className="w-4 h-4" />
                  {user._count.samples} samples
                </span>
                <span className="flex items-center gap-1">
                  <ShoppingBag className="w-4 h-4" />
                  {user._count.purchases} purchases
                </span>
                <span>
                  Joined {new Date(user.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={() => handleAction(user.id, "unflag")}
                disabled={processingId === user.id}
                variant="outline"
                className="border-green-500/30 text-green-400 hover:bg-green-500/10"
              >
                {processingId === user.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Unflag
              </Button>
              {user.isActive && (
                <Button
                  onClick={() => handleAction(user.id, "suspend")}
                  disabled={processingId === user.id}
                  variant="outline"
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  {processingId === user.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Ban className="w-4 h-4 mr-2" />
                  )}
                  Suspend
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
