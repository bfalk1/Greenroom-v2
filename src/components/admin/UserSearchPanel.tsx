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
import { Search, User, Mail, Shield, Zap } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SearchUser {
  id: string;
  full_name: string;
  username: string;
  email: string;
  credits: number;
  role: string;
}

const MOCK_USERS: SearchUser[] = [
  {
    id: "u1",
    full_name: "John Doe",
    username: "johndoe",
    email: "john@example.com",
    credits: 150,
    role: "user",
  },
  {
    id: "u2",
    full_name: "Jane Smith",
    username: "janesmith",
    email: "jane@example.com",
    credits: 200,
    role: "moderator",
  },
];

export function UserSearchPanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [creditAdjustment, setCreditAdjustment] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [updatingRole, setUpdatingRole] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      setLoading(true);
      // TODO: Replace with Supabase/Prisma call
      const filtered = MOCK_USERS.filter(
        (u) =>
          u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.username?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchResults(filtered);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustCredits = async () => {
    if (!selectedUser || !creditAdjustment) return;

    try {
      setAdjusting(true);
      const adjustment = parseInt(creditAdjustment);
      const newBalance = (selectedUser.credits || 0) + adjustment;

      // TODO: Replace with Supabase/Prisma call
      alert(`Credits adjusted. New balance: ${newBalance}`);
      setSelectedUser({ ...selectedUser, credits: newBalance });
      setCreditAdjustment("");
    } catch (error) {
      console.error("Credit adjustment error:", error);
      alert("Failed to adjust credits");
    } finally {
      setAdjusting(false);
    }
  };

  const handleRoleChange = async (newRole: string) => {
    if (!selectedUser) return;

    try {
      setUpdatingRole(true);
      // TODO: Replace with Supabase/Prisma call
      alert(`Role updated to ${newRole}`);
      setSelectedUser({ ...selectedUser, role: newRole });
      setSearchResults(
        searchResults.map((u) =>
          u.id === selectedUser.id ? { ...u, role: newRole } : u
        )
      );
    } catch (error) {
      console.error("Role update error:", error);
      alert("Failed to update role");
    } finally {
      setUpdatingRole(false);
    }
  };

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
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
            />
            <Button
              onClick={handleSearch}
              disabled={loading}
              className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
            >
              <Search className="w-4 h-4" />
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
                  onClick={() => setSelectedUser(user)}
                  className={`p-4 rounded-lg cursor-pointer transition ${
                    selectedUser?.id === user.id
                      ? "bg-[#00FF88]/10 border-2 border-[#00FF88]"
                      : "bg-[#0a0a0a] border border-[#2a2a2a] hover:bg-[#141414]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-[#a1a1a1]" />
                      <div>
                        <p className="text-white font-medium">
                          {user.full_name || user.username}
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
                        <p className="text-white font-bold">
                          {user.credits || 0}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 px-2 py-1 rounded bg-[#2a2a2a]">
                        <Shield className="w-3 h-3 text-[#00FF88]" />
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
                Manage User: {selectedUser.full_name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Role Management */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[#a1a1a1]">
                    <Shield className="w-5 h-5 text-[#00FF88]" />
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
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="moderator">Moderator</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-[#a1a1a1]">
                    Admin: Full access | Moderator: Content moderation | User:
                    Standard access
                  </p>
                </div>

                {/* Credit Adjustment */}
                <div className="space-y-3 pt-4 border-t border-[#2a2a2a]">
                  <div className="flex items-center gap-2 text-[#a1a1a1]">
                    <Zap className="w-5 h-5 text-[#00FF88]" />
                    <span>
                      Current balance:{" "}
                      <strong className="text-white">
                        {selectedUser.credits || 0}
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
                      className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
                    />
                    <Button
                      onClick={handleAdjustCredits}
                      disabled={adjusting || !creditAdjustment}
                      className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
                    >
                      {adjusting ? "Adjusting..." : "Apply"}
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
