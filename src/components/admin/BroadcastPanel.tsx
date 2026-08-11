"use client";

// Admin home for outbound notifications: compose a new one and see what's
// already gone out, with read-through so a broadcast's reach is measurable
// rather than assumed.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Megaphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BroadcastComposeModal } from "@/components/admin/BroadcastComposeModal";
import {
  isBroadcastAudience,
  type BroadcastAudience,
} from "@/lib/broadcastAudience";

interface BroadcastRow {
  id: string;
  subject: string;
  body: string;
  audience: string;
  recipientCount: number;
  readCount: number;
  createdAt: string;
}

const AUDIENCE_TEXT: Record<BroadcastAudience, string> = {
  ALL: "Everyone",
  CREATORS: "Creators",
  USERS: "Members",
  SPECIFIC: "Selected people",
};

function audienceText(value: string) {
  return isBroadcastAudience(value) ? AUDIENCE_TEXT[value] : value;
}

export function BroadcastPanel() {
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);

  const fetchBroadcasts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/broadcasts?limit=25");
      if (!res.ok) return;
      const data = await res.json();
      setBroadcasts(data.broadcasts ?? []);
    } catch {
      // Panel degrades to an empty history rather than an error page.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBroadcasts();
  }, [fetchBroadcasts]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Notifications</h2>
          <p className="text-sm text-[#a1a1a1]">
            Send an in-app notification and email to everyone, creators,
            members, or a hand-picked list.
          </p>
        </div>
        <Button
          onClick={() => setComposeOpen(true)}
          className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
        >
          <Megaphone className="mr-2 h-4 w-4" />
          Send notification
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#39b54a]" />
        </div>
      ) : broadcasts.length === 0 ? (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-6 py-12 text-center">
          <Megaphone className="mx-auto mb-3 h-8 w-8 text-[#2a2a2a]" />
          <p className="font-medium text-white">Nothing sent yet</p>
          <p className="mt-1 text-sm text-[#a1a1a1]">
            Announcements you send will be listed here with their read rate.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b) => {
            const rate =
              b.recipientCount > 0
                ? Math.round((b.readCount / b.recipientCount) * 100)
                : 0;
            return (
              <div
                key={b.id}
                className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-white">{b.subject}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-[#a1a1a1]">
                      {b.body}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#39b54a]/15 px-2.5 py-0.5 text-xs font-medium text-[#39b54a]">
                    {audienceText(b.audience)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#666]">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {b.recipientCount} recipient
                    {b.recipientCount === 1 ? "" : "s"}
                  </span>
                  <span>
                    {b.readCount} read ({rate}%)
                  </span>
                  <span>{new Date(b.createdAt).toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BroadcastComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={fetchBroadcasts}
      />
    </div>
  );
}
