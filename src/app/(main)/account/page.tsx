"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Zap,
  LogOut,
  Save,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
} from "lucide-react";
import { CreditPackages } from "@/components/account/CreditPackages";
import { ProfilePictureUpload } from "@/components/account/ProfilePictureUpload";
import { BannerImageUpload } from "@/components/account/BannerImageUpload";
import { SocialLinksEditor } from "@/components/account/SocialLinksEditor";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";

interface SocialLinks {
  instagram?: string;
  tiktok?: string;
  twitter?: string;
  x?: string;
  spotify?: string;
  soundcloud?: string;
  apple_music?: string;
  youtube?: string;
  website?: string;
}

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  note: string | null;
  createdAt: string;
}

interface SubscriptionInfo {
  tierName: string;
  tierDisplayName: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  creditsPerMonth: number;
}

export default function AccountPage() {
  const { user, loading: userLoading, logout, refreshUser } = useUser();
  const [formData, setFormData] = useState({
    full_name: "",
    username: "",
    bio: "",
  });
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({});
  const [saving, setSaving] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    null
  );

  // Set form data when user loads
  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || "",
        username: user.username || "",
        bio: (user as { bio?: string }).bio || "",
      });
      // Load social links from user data
      const links = (user as { social_links?: SocialLinks }).social_links;
      if (links) {
        setSocialLinks(links);
      }
    }
  }, [user]);

  // Fetch credit balance
  useEffect(() => {
    if (!user) return;

    fetch("/api/credits/balance")
      .then((res) => res.json())
      .then((data) => {
        if (data.balance !== undefined) setCreditBalance(data.balance);
      })
      .catch(console.error);
  }, [user]);

  // Fetch recent transactions
  useEffect(() => {
    if (!user) return;

    fetch("/api/credits/transactions?limit=5")
      .then((res) => res.json())
      .then((data) => {
        if (data.transactions) setTransactions(data.transactions);
      })
      .catch(console.error);
  }, [user]);

  // Fetch subscription info
  useEffect(() => {
    if (!user) return;

    fetch("/api/user/subscription")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data?.subscription) setSubscription(data.subscription);
      })
      .catch(console.error);
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          social_links: socialLinks,
        }),
      });

      if (res.ok) {
        toast.success("Profile updated successfully!");
        refreshUser();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update profile.");
      }
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/subscription/portal", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to open billing portal");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error opening portal:", error);
      toast.error("Failed to open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00FF88] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <p className="text-[#a1a1a1]">Please sign in to view your account.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-white mb-8">Account Settings</h1>

        {/* Credits & Stats Section */}
        <div className="bg-[#1a1a1a] rounded-lg p-8 border border-[#2a2a2a] mb-8">
          <h2 className="text-lg font-semibold text-white mb-6">
            Account Overview
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-[#00FF88]" />
                <p className="text-sm font-medium text-[#a1a1a1]">
                  Credit Balance
                </p>
              </div>
              <p className="text-3xl font-bold text-white">{creditBalance}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#a1a1a1] mb-2">
                Subscription
              </p>
              <p className="text-2xl font-bold text-white">
                {subscription?.tierDisplayName || "None"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#a1a1a1] mb-2">
                Account Type
              </p>
              <p className="text-2xl font-bold text-white capitalize">
                {user.role?.toLowerCase() || "user"}
              </p>
            </div>
          </div>
        </div>

        {/* Subscription Section */}
        {subscription && (
          <div className="bg-[#1a1a1a] rounded-lg p-8 border border-[#2a2a2a] mb-8">
            <div className="flex items-center gap-2 mb-6">
              <CreditCard className="w-5 h-5 text-[#00FF88]" />
              <h2 className="text-lg font-semibold text-white">
                Subscription
              </h2>
            </div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-white font-medium mb-1">
                  {subscription.tierDisplayName} Plan
                </p>
                <p className="text-[#a1a1a1] text-sm">
                  {subscription.creditsPerMonth} credits per month
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                    subscription.cancelAtPeriodEnd
                      ? "bg-orange-900/30 text-orange-400"
                      : subscription.status === "ACTIVE"
                      ? "bg-green-900/30 text-green-400"
                      : subscription.status === "PAST_DUE"
                      ? "bg-yellow-900/30 text-yellow-400"
                      : "bg-red-900/30 text-red-400"
                  }`}
                >
                  {subscription.cancelAtPeriodEnd ? "CANCELLING" : subscription.status}
                </span>
              </div>
            </div>
            <div className="text-sm text-[#a1a1a1] mb-4">
              {subscription.cancelAtPeriodEnd ? (
                <p>
                  Cancels on{" "}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              ) : (
                <p>
                  Renews on{" "}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
            <Button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              variant="outline"
              className="w-full border-[#2a2a2a] hover:bg-[#2a2a2a] text-white"
            >
              {portalLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                "Manage Subscription"
              )}
            </Button>
          </div>
        )}

        {/* No Subscription CTA */}
        {!subscription && (
          <div className="bg-[#1a1a1a] rounded-lg p-8 border border-[#2a2a2a] mb-8 text-center">
            <Zap className="w-8 h-8 text-[#00FF88] mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-white mb-2">
              No Active Subscription
            </h2>
            <p className="text-[#a1a1a1] text-sm mb-4">
              Subscribe to get monthly credits and start downloading samples.
            </p>
            <Button
              onClick={() => (window.location.href = "/pricing")}
              className="bg-[#00FF88] text-black hover:bg-[#00cc6a] font-semibold"
            >
              View Plans
            </Button>
          </div>
        )}

        {/* Recent Transactions */}
        {transactions.length > 0 && (
          <div className="bg-[#1a1a1a] rounded-lg p-8 border border-[#2a2a2a] mb-8">
            <h2 className="text-lg font-semibold text-white mb-6">
              Recent Credit Activity
            </h2>
            <div className="space-y-4">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-3 border-b border-[#2a2a2a] last:border-0"
                >
                  <div className="flex items-center gap-3">
                    {tx.amount > 0 ? (
                      <ArrowUpRight className="w-4 h-4 text-green-400" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-red-400" />
                    )}
                    <div>
                      <p className="text-white text-sm font-medium">
                        {tx.note || tx.type}
                      </p>
                      <p className="text-[#a1a1a1] text-xs">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`font-semibold ${
                      tx.amount > 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {tx.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buy Credits */}
        <div className="bg-[#1a1a1a] rounded-lg p-8 border border-[#2a2a2a] mb-8">
          <CreditPackages />
        </div>

        {/* Profile Section */}
        <div className="bg-[#1a1a1a] rounded-lg p-8 border border-[#2a2a2a] mb-8">
          <h2 className="text-lg font-semibold text-white mb-6">
            Profile Information
          </h2>

          <div className="mb-8 pb-8 border-b border-[#2a2a2a]">
            <label className="block text-sm font-medium text-white mb-4">
              Profile Picture
            </label>
            <ProfilePictureUpload
              user={{ creator_avatar_url: user.avatar_url }}
              onUploadSuccess={() => refreshUser()}
            />
          </div>

          {user.is_creator && (
            <div className="mb-8 pb-8 border-b border-[#2a2a2a]">
              <label className="block text-sm font-medium text-white mb-4">
                Banner Image
              </label>
              <BannerImageUpload
                user={{ creator_banner_url: null }}
                onUploadSuccess={() => refreshUser()}
              />
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Email
              </label>
              <Input
                type="email"
                value={user.email}
                disabled
                className="bg-[#0a0a0a] border-[#2a2a2a] text-[#a1a1a1] cursor-not-allowed"
              />
              <p className="text-xs text-[#a1a1a1] mt-1">
                Email cannot be changed
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Full Name
              </label>
              <Input
                type="text"
                value={formData.full_name}
                onChange={(e) =>
                  setFormData({ ...formData, full_name: e.target.value })
                }
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Username
              </label>
              <Input
                type="text"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Account Role
              </label>
              <Input
                type="text"
                value={user.role || "User"}
                disabled
                className="bg-[#0a0a0a] border-[#2a2a2a] text-[#a1a1a1] cursor-not-allowed capitalize"
              />
            </div>

            {/* Bio - for creators */}
            {user.is_creator && (
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Bio
                </label>
                <textarea
                  value={formData.bio}
                  onChange={(e) =>
                    setFormData({ ...formData, bio: e.target.value })
                  }
                  placeholder="Tell fans about yourself..."
                  rows={4}
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-[#666] focus:outline-none focus:border-[#00FF88] resize-none"
                />
              </div>
            )}

            {/* Social Links - for creators */}
            {user.is_creator && (
              <div className="pt-4 border-t border-[#2a2a2a]">
                <SocialLinksEditor
                  socialLinks={socialLinks}
                  onChange={setSocialLinks}
                />
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-[#00FF88] text-black hover:bg-[#00cc6a] h-11 font-semibold"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-950/20 rounded-lg p-8 border border-red-900/30">
          <h2 className="text-lg font-semibold text-red-400 mb-3">
            Danger Zone
          </h2>
          <p className="text-[#a1a1a1] text-sm mb-6">
            Logging out will end your current session.
          </p>
          <Button
            onClick={handleLogout}
            className="w-full bg-red-600 hover:bg-red-700 text-white"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
