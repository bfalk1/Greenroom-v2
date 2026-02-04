"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function OnboardingPage() {
  const [formData, setFormData] = useState({
    username: "",
    full_name: "",
    address: "",
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // TODO: Replace with Supabase/Prisma call
      router.push("/marketplace");
    } catch (error) {
      console.error("Error completing profile:", error);
      alert("Failed to complete profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Complete Your Profile
          </h1>
          <p className="text-[#a1a1a1]">
            Just a few quick details to get started
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Username
            </label>
            <Input
              type="text"
              required
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              placeholder="your_username"
              className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Full Name
            </label>
            <Input
              type="text"
              required
              value={formData.full_name}
              onChange={(e) =>
                setFormData({ ...formData, full_name: e.target.value })
              }
              placeholder="Your Name"
              className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Address
            </label>
            <Input
              type="text"
              required
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              placeholder="Your Street Address"
              className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#00FF88] text-black hover:bg-[#00cc6a] font-semibold py-3 flex items-center justify-center gap-2"
          >
            {loading ? "Creating Profile..." : "Continue"}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>

        <p className="text-center text-[#a1a1a1] text-sm mt-6">
          You can always update these later in your account settings.
        </p>
      </div>
    </div>
  );
}
