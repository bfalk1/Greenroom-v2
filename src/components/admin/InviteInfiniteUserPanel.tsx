"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Infinity as InfinityIcon } from "lucide-react";
import { toast } from "sonner";

const INFINITE_CREDITS = 999999;

export function InviteInfiniteUserPanel() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }

    const confirmed = window.confirm(
      `Send an INFINITE-credit (${INFINITE_CREDITS.toLocaleString()}) premium invite to ${email}? This grants effectively unlimited downloads.`
    );
    if (!confirmed) return;

    setSending(true);
    try {
      const res = await fetch("/api/admin/beta-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          message: message.trim() || undefined,
          credits: INFINITE_CREDITS,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send invite");
      }

      toast.success(`Infinite invite sent to ${email}!`);
      setEmail("");
      setMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send invite");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#39b54a]/30 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-[#39b54a]/10 rounded-lg">
          <InfinityIcon className="w-5 h-5 text-[#39b54a]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">
            Invite Infinite User
          </h3>
          <p className="text-sm text-[#a1a1a1]">
            Send a premium invite with {INFINITE_CREDITS.toLocaleString()} credits (effectively unlimited)
          </p>
        </div>
      </div>

      <form onSubmit={handleSendInvite} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Email Address *
          </label>
          <Input
            type="email"
            placeholder="premium-user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Personal Message (optional)
          </label>
          <textarea
            placeholder="Add a personal note to the invite..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a]"
            rows={2}
          />
        </div>

        <Button
          type="submit"
          disabled={sending || !email.trim()}
          className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          Send Infinite Invite
        </Button>
      </form>
    </div>
  );
}
