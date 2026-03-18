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
    city: "",
    country: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to complete profile");
        return;
      }

      router.push("/marketplace");
      router.refresh();
    } catch (err) {
      console.error("Error completing profile:", err);
      setError("Failed to complete profile. Please try again.");
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

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/30 border border-red-900/30 text-red-400 text-sm">
            {error}
          </div>
        )}

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
                setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })
              }
              placeholder="your_username"
              className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
            />
            <p className="text-xs text-[#666] mt-1">Lowercase letters, numbers, and underscores only</p>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                City
              </label>
              <Input
                type="text"
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                placeholder="City"
                className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Country
              </label>
              <Input
                type="text"
                value={formData.country}
                onChange={(e) =>
                  setFormData({ ...formData, country: e.target.value })
                }
                placeholder="Country"
                className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold py-3 flex items-center justify-center gap-2"
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
