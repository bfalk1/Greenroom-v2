"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, User, Mail, Shield, Zap, Percent, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface SearchUser {
  id: string;
  email: string;
  username: string | null;
  fullName: string | null;
  artistName: string | null;
  avatarUrl: string | null;
  credits: number;
  role: string;
  payoutRate: number | null;
  isWhitelisted: boolean;
}

export function UserSearchPanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [creditAdjustment, setCreditAdjustment] = useState("");
  const [payoutRateInput, setPayoutRateInput] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [updatingRole, setUpdatingRole] = useState(false);
  const [updatingPayout, setUpdatingPayout] = useState(false);
  const [updatingWhitelist, setUpdatingWhitelist] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchQuery)}`);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Search failed");
      }
      
      const data = await res.json();
      setSearchResults(data.users);
      setSelectedUser(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = (user: SearchUser) => {
    setSelectedUser(user);
    setPayoutRateInput(user.payoutRate?.toString() || "");
    setCreditAdjustment("");
  };

  const handleAdjustCredits = async () => {
    if (!selectedUser || !creditAdjustment) return;

    try {
      setAdjusting(true);
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          creditAdjustment: parseInt(creditAdjustment),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to adjust credits");
      }

      const data = await res.json();
      const updatedUser = data.user;
      
      setSelectedUser(updatedUser);
      setSearchResults(results =>
        results.map(u => u.id === updatedUser.id ? updatedUser : u)
      );
      setCreditAdjustment("");
      toast.success(`Credits updated: ${updatedUser.credits}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to adjust credits");
    } finally {
      setAdjusting(false);
    }
  };

  const handleRoleChange = async (newRole: string) => {
    if (!selectedUser) return;

    try {
      setUpdatingRole(true);
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          role: newRole,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update role");
      }

      const data = await res.json();
      const updatedUser = data.user;
      
      setSelectedUser(updatedUser);
      setSearchResults(results =>
        results.map(u => u.id === updatedUser.id ? updatedUser : u)
      );
      toast.success(`Role updated to ${newRole}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update role");
    } finally {
      setUpdatingRole(false);
    }
  };

  const handlePayoutRateChange = async () => {
    if (!selectedUser) return;

    try {
      setUpdatingPayout(true);
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          payoutRate: payoutRateInput === "" ? null : parseInt(payoutRateInput),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update payout rate");
      }

      const data = await res.json();
      const updatedUser = data.user;
      
      setSelectedUser(updatedUser);
      setSearchResults(results =>
        results.map(u => u.id === updatedUser.id ? updatedUser : u)
      );
      
      if (updatedUser.payoutRate === null) {
        toast.success("Payout rate reset to platform default");
      } else {
        toast.success(`Payout rate set to ${updatedUser.payoutRate}%`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update payout rate");
    } finally {
      setUpdatingPayout(false);
    }
  };

  const handleToggleWhitelist = async () => {
    if (!selectedUser) return;

    try {
      setUpdatingWhitelist(true);
      const res = await fetch(`/api/admin/creators/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isWhitelisted: !selectedUser.isWhitelisted,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update whitelist");
      }

      const newStatus = !selectedUser.isWhitelisted;
      const updatedUser = { ...selectedUser, isWhitelisted: newStatus };
      
      setSelectedUser(updatedUser);
      setSearchResults(results =>
        results.map(u => u.id === updatedUser.id ? updatedUser : u)
      );
      toast.success(newStatus ? "Creator whitelisted - samples auto-publish" : "Creator removed from whitelist");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update whitelist");
    } finally {
      setUpdatingWhitelist(false);
    }
  };

  const displayName = (user: SearchUser) => 
    user.artistName || user.fullName || user.username || "Unknown";

  const isCreator = selectedUser?.role === "CREATOR";

  return (
    <div className="space-y-6">
      <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
        <CardHeader>
          <CardTitle className="text-white">User Search</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Search by email, name, or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
            />
            <Button
              onClick={handleSearch}
              disabled={loading}
              className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {searchResults.length > 0 && (
        <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
          <CardHeader>
            <CardTitle className="text-white">
              Search Results ({searchResults.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className={`p-4 rounded-lg cursor-pointer transition ${
                    selectedUser?.id === user.id
                      ? "bg-[#39b54a]/10 border-2 border-[#39b54a]"
                      : "bg-[#0a0a0a] border border-[#2a2a2a] hover:bg-[#141414]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                          <User className="w-5 h-5 text-[#a1a1a1]" />
                        </div>
                      )}
                      <div>
                        <p className="text-white font-medium">
                          {displayName(user)}
                        </p>
                        <p className="text-sm text-[#a1a1a1] flex items-center gap-2">
                          <Mail className="w-3 h-3" />
                          {user.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-[#a1a1a1]">Credits</p>
                        <p className="text-white font-bold">{user.credits}</p>
                      </div>
                      {user.role === "CREATOR" && user.payoutRate !== null && (
                        <div className="text-right">
                          <p className="text-sm text-[#a1a1a1]">Payout</p>
                          <p className="text-[#39b54a] font-bold">${(user.payoutRate / 100).toFixed(2)}/cr</p>
                        </div>
                      )}
                      <div className={`flex items-center gap-2 px-2 py-1 rounded ${
                        user.role === "ADMIN" ? "bg-red-500/20" :
                        user.role === "MODERATOR" ? "bg-purple-500/20" :
                        user.role === "CREATOR" ? "bg-[#39b54a]/20" :
                        "bg-[#2a2a2a]"
                      }`}>
                        <Shield className={`w-3 h-3 ${
                          user.role === "ADMIN" ? "text-red-400" :
                          user.role === "MODERATOR" ? "text-purple-400" :
                          user.role === "CREATOR" ? "text-[#39b54a]" :
                          "text-[#a1a1a1]"
                        }`} />
                        <span className="text-xs text-white">{user.role}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedUser && (
        <div className="space-y-6">
          <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
            <CardHeader>
              <CardTitle className="text-white">
                Manage User: {displayName(selectedUser)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Role Management */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[#a1a1a1]">
                    <Shield className="w-5 h-5 text-[#39b54a]" />
                    <span>Change Role</span>
                  </div>
                  <Select
                    value={selectedUser.role}
                    onValueChange={handleRoleChange}
                    disabled={updatingRole}
                  >
                    <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USER">User</SelectItem>
                      <SelectItem value="CREATOR">Creator</SelectItem>
                      <SelectItem value="MODERATOR">Moderator</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-[#a1a1a1]">
                    Admin: Full access | Moderator: Content moderation | Creator: Can upload samples | User: Standard access
                  </p>
                </div>

                {/* Whitelist Toggle (Creators only) */}
                {isCreator && (
                  <div className="space-y-3 pt-4 border-t border-[#2a2a2a]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[#a1a1a1]">
                        <Shield className="w-5 h-5 text-[#39b54a]" />
                        <span>Whitelist Status</span>
                      </div>
                      <Button
                        onClick={handleToggleWhitelist}
                        disabled={updatingWhitelist}
                        className={selectedUser.isWhitelisted 
                          ? "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30" 
                          : "bg-[#2a2a2a] text-[#a1a1a1] hover:text-white hover:bg-[#3a3a3a]"
                        }
                      >
                        {updatingWhitelist ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Shield className="w-4 h-4 mr-2" />
                        )}
                        {selectedUser.isWhitelisted ? "Whitelisted" : "Not Whitelisted"}
                      </Button>
                    </div>
                    <p className="text-xs text-[#a1a1a1]">
                      Whitelisted creators can upload samples that are automatically published without mod review.
                    </p>
                  </div>
                )}

                {/* Payout Rate (Creators only) */}
                {(isCreator || selectedUser.payoutRate !== null) && (
                  <div className="space-y-3 pt-4 border-t border-[#2a2a2a]">
                    <div className="flex items-center gap-2 text-[#a1a1a1]">
                      <Percent className="w-5 h-5 text-[#39b54a]" />
                      <span>
                        Payout Rate (¢/credit)
                        {selectedUser.payoutRate === null ? (
                          <span className="ml-2 text-xs text-[#666]">(default: $0.03/credit)</span>
                        ) : (
                          <span className="ml-2 text-xs text-[#39b54a]">(custom: ${(selectedUser.payoutRate / 100).toFixed(2)}/credit)</span>
                        )}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="50"
                        placeholder="Default: 3 (= $0.03/credit)"
                        value={payoutRateInput}
                        onChange={(e) => setPayoutRateInput(e.target.value)}
                        className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
                      />
                      <Button
                        onClick={handlePayoutRateChange}
                        disabled={updatingPayout}
                        className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
                      >
                        {updatingPayout ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                    <p className="text-xs text-[#a1a1a1]">
                      Cents per credit (e.g., 3 = $0.03, 5 = $0.05). Leave empty for default $0.03/credit.
                    </p>
                  </div>
                )}

                {/* Credit Adjustment */}
                <div className="space-y-3 pt-4 border-t border-[#2a2a2a]">
                  <div className="flex items-center gap-2 text-[#a1a1a1]">
                    <Zap className="w-5 h-5 text-[#39b54a]" />
                    <span>
                      Current balance:{" "}
                      <strong className="text-white">
                        {selectedUser.credits}
                      </strong>{" "}
                      credits
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Enter adjustment (+ or -)"
                      value={creditAdjustment}
                      onChange={(e) => setCreditAdjustment(e.target.value)}
                      className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
                    />
                    <Button
                      onClick={handleAdjustCredits}
                      disabled={adjusting || !creditAdjustment}
                      className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
                    >
                      {adjusting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                  <p className="text-xs text-[#a1a1a1]">
                    Enter a positive number to add credits or negative to
                    subtract (e.g., 100 or -50)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
