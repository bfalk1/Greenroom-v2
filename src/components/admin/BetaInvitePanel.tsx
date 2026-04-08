"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mail,
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  Copy,
  RefreshCw,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface Inviter {
  id: string;
  email: string;
  username: string | null;
  artistName: string | null;
}

interface UsedBy {
  id: string;
  email: string;
  username: string | null;
  artistName: string | null;
}

interface BetaInvite {
  id: string;
  email: string;
  message: string | null;
  token: string;
  credits: number;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
  inviter: Inviter;
  usedBy: UsedBy | null;
  emailStatus: "pending" | "sent" | "failed";
  emailError: string | null;
  emailSentAt: string | null;
  retryCount: number;
}

export function BetaInvitePanel() {
  const [invites, setInvites] = useState<BetaInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/beta-invites");
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites);
      }
    } catch (error) {
      console.error("Failed to fetch beta invites:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/admin/beta-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          message: message.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send invite");
      }

      toast.success(`Beta invite sent to ${email}!`);
      setEmail("");
      setMessage("");
      await fetchInvites();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send invite");
    } finally {
      setSending(false);
    }
  };

  const handleDeleteInvite = async (inviteId: string) => {
    const confirmed = window.confirm("Revoke this beta invite?");
    if (!confirmed) return;

    setDeletingId(inviteId);
    try {
      const res = await fetch(`/api/admin/beta-invites?id=${inviteId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete invite");
      }

      toast.success("Beta invite revoked");
      await fetchInvites();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete invite");
    } finally {
      setDeletingId(null);
    }
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/signup?beta=${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Beta invite link copied!");
  };

  const handleRetryEmail = async (inviteId: string) => {
    setRetryingId(inviteId);
    try {
      const res = await fetch("/api/admin/beta-invites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to retry");
      }

      toast.success("Email sent successfully!");
      await fetchInvites();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send email");
    } finally {
      setRetryingId(null);
    }
  };

  const getInviteStatus = (invite: BetaInvite) => {
    if (invite.usedAt) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#39b54a]/20 text-[#39b54a] border border-[#39b54a]/30">
          <CheckCircle2 className="w-3 h-3" />
          Used
        </span>
      );
    }
    if (new Date(invite.expiresAt) < new Date()) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
          <XCircle className="w-3 h-3" />
          Expired
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
        <Clock className="w-3 h-3" />
        Pending
      </span>
    );
  };

  const getEmailStatus = (invite: BetaInvite) => {
    if (invite.emailStatus === "sent") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[#39b54a]">
          <CheckCircle2 className="w-3 h-3" />
          Email sent
        </span>
      );
    }
    if (invite.emailStatus === "failed") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-red-400" title={invite.emailError || "Email failed"}>
          <AlertTriangle className="w-3 h-3" />
          Email failed {invite.retryCount > 0 && `(${invite.retryCount} retries)`}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
        <Clock className="w-3 h-3" />
        Email pending
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-[#39b54a] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invite Form */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Sparkles className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Invite Beta User</h3>
            <p className="text-sm text-[#a1a1a1]">
              Send a beta invite with 100 free credits and paywall bypass
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
              placeholder="beta-tester@example.com"
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
            Send Beta Invite
          </Button>
        </form>
      </div>

      {/* Invites List */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Mail className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Sent Beta Invites</h3>
            <p className="text-sm text-[#a1a1a1]">
              {invites.length} invite{invites.length !== 1 ? "s" : ""} sent
            </p>
          </div>
        </div>

        {invites.length > 0 ? (
          <div className="space-y-3">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-4 bg-[#0a0a0a] rounded-lg border border-[#2a2a2a]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-white font-medium truncate">
                      {invite.email}
                    </p>
                    {getInviteStatus(invite)}
                    <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
                      {invite.credits} credits
                    </span>
                  </div>
                  <p className="text-xs text-[#666] mt-1">
                    Invited {new Date(invite.createdAt).toLocaleDateString()} by{" "}
                    {invite.inviter.artistName || invite.inviter.username || invite.inviter.email}
                    {!invite.usedAt && new Date(invite.expiresAt) > new Date() && (
                      <> • Expires {new Date(invite.expiresAt).toLocaleDateString()}</>
                    )}
                    {invite.usedAt && invite.usedBy && (
                      <> • Signed up as {invite.usedBy.username || invite.usedBy.email}</>
                    )}
                  </p>
                  <div className="mt-1">
                    {getEmailStatus(invite)}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {!invite.usedAt && new Date(invite.expiresAt) > new Date() && (
                    <>
                      {invite.emailStatus === "failed" && (
                        <Button
                          onClick={() => handleRetryEmail(invite.id)}
                          disabled={retryingId === invite.id}
                          variant="ghost"
                          className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                          title="Retry sending email"
                        >
                          {retryingId === invite.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                      <Button
                        onClick={() => copyInviteLink(invite.token)}
                        variant="ghost"
                        className="text-[#a1a1a1] hover:text-white hover:bg-[#2a2a2a]"
                        title="Copy invite link"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteInvite(invite.id)}
                        disabled={deletingId === invite.id}
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        title="Revoke invite"
                      >
                        {deletingId === invite.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Sparkles className="w-12 h-12 text-[#2a2a2a] mx-auto mb-3" />
            <p className="text-[#a1a1a1]">No beta invites sent yet</p>
            <p className="text-xs text-[#666]">Use the form above to invite beta testers</p>
          </div>
        )}
      </div>
    </div>
  );
}
