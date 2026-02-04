"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Music } from "lucide-react";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      alert("Passwords don't match");
      return;
    }

    setLoading(true);

    try {
      // TODO: Replace with Supabase auth
      router.push("/onboarding");
    } catch (error) {
      console.error("Signup error:", error);
      alert("Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00FF88] to-[#00cc6a] flex items-center justify-center">
              <Music className="w-7 h-7 text-black" />
            </div>
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">
            Create Your Account
          </h1>
          <p className="text-[#a1a1a1]">
            Join GREENROOM and start discovering samples
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Email
            </label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Password
            </label>
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Confirm Password
            </label>
            <Input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#00FF88] text-black hover:bg-[#00cc6a] font-semibold py-3"
          >
            {loading ? "Creating Account..." : "Sign Up"}
          </Button>
        </form>

        <p className="text-center text-[#a1a1a1] text-sm mt-6">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-[#00FF88] hover:text-[#00cc6a] font-medium"
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
