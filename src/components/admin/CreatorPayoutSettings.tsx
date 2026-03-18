"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DollarSign,
  Search,
  User,
  Shield,
  Loader2,
  Check,
  X,
  Percent,
} from "lucide-react";
import { toast } from "sonner";

interface Creator {
  id: string;
  email: string;
  username: string | null;
  artistName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  customPayoutRate: number | null;
  isWhitelisted: boolean;
  _count: {
    samples: number;
  };
}

interface CreatorPayoutSettingsProps {
  platformDefaultRate: number;
}

export function CreatorPayoutSettings({ platformDefaultRate }: CreatorPayoutSettingsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRate, setEditingRate] = useState<string>("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const searchCreators = useCallback(async () => {
    if (!searchQuery.trim()) {
      setCreators([]);
      return;
    }

    setLoading(true);
    try {
      // Use the user search endpoint but filter by creator role
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchQuery)}&role=CREATOR`);
      if (res.ok) {
        const data = await res.json();
        setCreators(data.users || []);
      }
    } catch (error) {
      console.error("Failed to search creators:", error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const handleSaveRate = async (creatorId: string) => {
    setSavingId(creatorId);
    try {
      const rate = editingRate === "" ? null : parseInt(editingRate);
      
      if (rate !== null && (isNaN(rate) || rate < 0 || rate > 100)) {
        toast.error("Payout rate must be between 0 and 100");
        return;
      }

      const res = await fetch(`/api/admin/creators/${creatorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customPayoutRate: rate }),
      });

      if (!res.ok) {
        throw new Error("Failed to update");
      }

      toast.success("Payout rate updated");
      setEditingId(null);
      
      // Update local state
      setCreators(prev => prev.map(c => 
        c.id === creatorId 
          ? { ...c, customPayoutRate: rate }
          : c
      ));
    } catch (error) {
      toast.error("Failed to update payout rate");
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleWhitelist = async (creatorId: string, currentValue: boolean) => {
    setSavingId(creatorId);
    try {
      const res = await fetch(`/api/admin/creators/${creatorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isWhitelisted: !currentValue }),
      });

      if (!res.ok) {
        throw new Error("Failed to update");
      }

      toast.success(currentValue ? "Removed from whitelist" : "Added to whitelist");
      
      // Update local state
      setCreators(prev => prev.map(c => 
        c.id === creatorId 
          ? { ...c, isWhitelisted: !currentValue }
          : c
      ));
    } catch (error) {
      toast.error("Failed to update whitelist status");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-[#39b54a]/10 rounded-lg">
          <Percent className="w-5 h-5 text-[#39b54a]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Per-Creator Profit Split</h3>
          <p className="text-sm text-[#a1a1a1]">
            Platform default: {platformDefaultRate}% to creator
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-3 w-5 h-5 text-[#a1a1a1]" />
          <Input
            type="text"
            placeholder="Search creators by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchCreators()}
            className="pl-12 bg-[#0a0a0a] border-[#2a2a2a] text-white"
          />
        </div>
        <Button
          onClick={searchCreators}
          disabled={loading}
          className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
        </Button>
      </div>

      {/* Results */}
      {creators.length > 0 && (
        <div className="space-y-3">
          {creators.map((creator) => (
            <div
              key={creator.id}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4"
            >
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center flex-shrink-0">
                  {creator.avatarUrl ? (
                    <img
                      src={creator.avatarUrl}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-5 h-5 text-[#a1a1a1]" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-white font-medium truncate">
                      {creator.artistName || creator.fullName || creator.username}
                    </h4>
                    {creator.isWhitelisted && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400 flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        Whitelisted
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#a1a1a1] truncate">{creator.email}</p>
                  <p className="text-xs text-[#666]">{creator._count?.samples || 0} samples</p>
                </div>

                {/* Payout Rate */}
                <div className="flex items-center gap-2">
                  {editingId === creator.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={editingRate}
                        onChange={(e) => setEditingRate(e.target.value)}
                        placeholder={String(platformDefaultRate)}
                        className="w-20 bg-[#0a0a0a] border-[#2a2a2a] text-white text-center"
                      />
                      <span className="text-[#a1a1a1]">%</span>
                      <Button
                        onClick={() => handleSaveRate(creator.id)}
                        disabled={savingId === creator.id}
                        size="sm"
                        className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
                      >
                        {savingId === creator.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        onClick={() => setEditingId(null)}
                        size="sm"
                        variant="outline"
                        className="border-[#2a2a2a]"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingId(creator.id);
                        setEditingRate(creator.customPayoutRate?.toString() || "");
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0a0a0a] border border-[#2a2a2a] hover:border-[#3a3a3a] transition"
                    >
                      <DollarSign className="w-4 h-4 text-[#39b54a]" />
                      <span className="text-white font-medium">
                        {creator.customPayoutRate ?? platformDefaultRate}%
                      </span>
                      {creator.customPayoutRate !== null && (
                        <span className="text-xs text-[#a1a1a1]">(custom)</span>
                      )}
                    </button>
                  )}

                  {/* Whitelist Toggle */}
                  <Button
                    onClick={() => handleToggleWhitelist(creator.id, creator.isWhitelisted)}
                    disabled={savingId === creator.id}
                    size="sm"
                    variant="outline"
                    className={
                      creator.isWhitelisted
                        ? "border-green-500/30 text-green-400 hover:bg-green-500/10"
                        : "border-[#2a2a2a] text-[#a1a1a1] hover:text-white"
                    }
                  >
                    <Shield className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {searchQuery && creators.length === 0 && !loading && (
        <div className="text-center py-8">
          <User className="w-12 h-12 text-[#2a2a2a] mx-auto mb-3" />
          <p className="text-[#a1a1a1]">No creators found</p>
        </div>
      )}

      {!searchQuery && (
        <div className="text-center py-8 text-[#a1a1a1]">
          <p>Search for a creator to adjust their payout rate</p>
        </div>
      )}
    </div>
  );
}
