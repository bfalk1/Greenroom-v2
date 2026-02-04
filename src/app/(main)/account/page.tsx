"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, LogOut, Save } from "lucide-react";
import { CreditPackages } from "@/components/account/CreditPackages";
import { ProfilePictureUpload } from "@/components/account/ProfilePictureUpload";
import { BannerImageUpload } from "@/components/account/BannerImageUpload";

export default function AccountPage() {
  // TODO: Replace with Supabase auth
  const [user] = useState({
    id: "mock-user",
    email: "user@example.com",
    full_name: "John Doe",
    username: "johndoe",
    credits: 150,
    samples_purchased_count: 12,
    role: "user",
    subscription_status: "active",
    is_creator: true,
    creator_avatar_url: null as string | null,
    creator_banner_url: null as string | null,
  });

  const [formData, setFormData] = useState({
    full_name: user.full_name,
    username: user.username,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // TODO: Replace with Supabase/Prisma call
      alert("Profile updated successfully!");
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    // TODO: Replace with Supabase logout
    console.log("logout");
  };

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
                  Current Credits
                </p>
              </div>
              <p className="text-3xl font-bold text-white">
                {user.credits || 0}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#a1a1a1] mb-2">
                Samples Purchased
              </p>
              <p className="text-3xl font-bold text-white">
                {user.samples_purchased_count || 0}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#a1a1a1] mb-2">
                Account Type
              </p>
              <p className="text-2xl font-bold text-white capitalize">
                {user.role || "user"}
              </p>
            </div>
          </div>
        </div>

        {/* Buy Credits Section */}
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
              user={user}
              onUploadSuccess={() => {}}
            />
          </div>

          {user.is_creator && (
            <div className="mb-8 pb-8 border-b border-[#2a2a2a]">
              <label className="block text-sm font-medium text-white mb-4">
                Banner Image
              </label>
              <BannerImageUpload
                user={user}
                onUploadSuccess={() => {}}
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

        {/* Subscription Section */}
        {user.subscription_status === "active" && (
          <div className="bg-[#1a1a1a] rounded-lg p-8 border border-[#2a2a2a] mb-8">
            <h2 className="text-lg font-semibold text-white mb-6">
              Subscription
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium mb-1">Premium Plan</p>
                <p className="text-[#a1a1a1] text-sm">
                  Unlimited downloads with monthly credit allowance
                </p>
              </div>
              <div className="text-right">
                <p className="text-white font-medium">Active</p>
                <p className="text-[#a1a1a1] text-sm">Renews automatically</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full mt-6 border-[#2a2a2a] hover:bg-[#1a1a1a]"
            >
              Manage Subscription
            </Button>
          </div>
        )}

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
