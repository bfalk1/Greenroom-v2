"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Inbox,
  Loader2,
  Megaphone,
  MessageSquarePlus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUser } from "@/lib/hooks/useUser";
import { StaffThreadView } from "@/components/admin/StaffThreadView";
import { MessageUserModal } from "@/components/admin/MessageUserModal";
import { BroadcastComposeModal } from "@/components/admin/BroadcastComposeModal";

interface ThreadUser {
  id: string;
  email: string;
  username: string | null;
  artistName: string | null;
  avatarUrl: string | null;
}

interface InboxThread {
  id: string;
  subject: string;
  status: "OPEN" | "CLOSED";
  contextType: string | null;
  contextId: string | null;
  lastMessageAt: string;
  staffUnread: boolean;
  user: ThreadUser;
  lastMessage: {
    body: string;
    senderRole: "USER" | "STAFF";
    createdAt: string;
  } | null;
}

type InboxFilter = "unread" | "open" | "closed" | "all";

const FILTER_TABS: { label: string; value: InboxFilter }[] = [
  { label: "Unread", value: "unread" },
  { label: "Open", value: "open" },
  { label: "Closed", value: "closed" },
  { label: "All", value: "all" },
];

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function ModInboxPage() {
  const { user, loading: userLoading } = useUser();

  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<ThreadUser | null>(null);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);

  const isStaff = user?.role === "MODERATOR" || user?.role === "ADMIN";
  const isAdmin = user?.role === "ADMIN";

  // Debounce the search input.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const fetchThreads = useCallback(async (): Promise<InboxThread[] | null> => {
    try {
      const params = new URLSearchParams({ filter, limit: "30" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/mod/inbox?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to load inbox");
      }
      const data = await res.json();
      setThreads(data.threads ?? []);
      return data.threads ?? [];
    } catch (error) {
      console.error(error);
      toast.error("Failed to load inbox");
      return null;
    } finally {
      setLoadingList(false);
    }
  }, [filter, search]);

  useEffect(() => {
    if (!isStaff) return;
    setLoadingList(true);
    fetchThreads();
  }, [isStaff, fetchThreads]);

  const handleSelect = (thread: InboxThread) => {
    setSelectedId(thread.id);
    setSelectedUser(thread.user);
  };

  // After composing a new message, jump straight into the new thread.
  const handleSent = async (threadId: string) => {
    setSelectedId(threadId);
    setSelectedUser(null);
    const list = await fetchThreads();
    const match = list?.find((t) => t.id === threadId);
    if (match) setSelectedUser(match.user);
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
      </div>
    );
  }

  if (!user || !isStaff) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Access denied</h2>
          <p className="text-[#a1a1a1]">
            You need moderator access to view the inbox.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Inbox</h1>
            <p className="text-[#a1a1a1]">
              Conversations with applicants and creators
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setMessageModalOpen(true)}
              variant="outline"
              className="border-[#2a2a2a] text-[#a1a1a1] hover:text-white hover:bg-[#1a1a1a]"
            >
              <MessageSquarePlus className="w-4 h-4 mr-2" />
              Message a user
            </Button>
            {isAdmin && (
              <Button
                onClick={() => setBroadcastModalOpen(true)}
                className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
              >
                <Megaphone className="w-4 h-4 mr-2" />
                New broadcast
              </Button>
            )}
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-[380px_1fr] gap-4">
          {/* Thread list */}
          <div className={selectedId ? "hidden lg:block" : ""}>
            {/* Filter pills */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setFilter(tab.value)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                    filter === tab.value
                      ? "bg-[#39b54a] text-black"
                      : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white border border-[#2a2a2a]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#666]" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by user or subject..."
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a]"
              />
            </div>

            {/* Rows */}
            {loadingList ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-[#39b54a] animate-spin" />
              </div>
            ) : threads.length > 0 ? (
              <div className="space-y-2">
                {threads.map((thread) => {
                  const name =
                    thread.user.artistName ||
                    thread.user.username ||
                    thread.user.email;
                  const isSelected = selectedId === thread.id;
                  return (
                    <button
                      key={thread.id}
                      onClick={() => handleSelect(thread)}
                      className={`w-full text-left bg-[#1a1a1a] border rounded-lg p-3 transition hover:bg-[#242424] ${
                        isSelected
                          ? "border-[#39b54a]/50"
                          : "border-[#2a2a2a]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="flex items-center gap-2 min-w-0">
                          {thread.staffUnread && (
                            <span className="w-2 h-2 rounded-full bg-[#39b54a] shrink-0" />
                          )}
                          <span className="font-medium text-white truncate">
                            {name}
                          </span>
                          {thread.status === "CLOSED" && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#2a2a2a] text-[#666] shrink-0">
                              CLOSED
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-[#666] shrink-0">
                          {timeAgo(thread.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-sm text-[#a1a1a1] truncate">
                        {thread.subject}
                      </p>
                      {thread.lastMessage && (
                        <p className="text-xs text-[#666] truncate mt-0.5">
                          {thread.lastMessage.senderRole === "STAFF"
                            ? "You: "
                            : ""}
                          {thread.lastMessage.body}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
                <Inbox className="w-10 h-10 text-[#2a2a2a] mx-auto mb-3" />
                <p className="text-white font-medium mb-1">
                  No conversations
                </p>
                <p className="text-sm text-[#a1a1a1] px-6">
                  {filter === "unread"
                    ? "All caught up! No unread conversations."
                    : "No conversations match this filter."}
                </p>
              </div>
            )}
          </div>

          {/* Detail */}
          <div className={selectedId ? "" : "hidden lg:block"}>
            {selectedId && (
              <button
                onClick={() => setSelectedId(null)}
                className="lg:hidden flex items-center gap-1.5 text-sm text-[#a1a1a1] hover:text-white mb-3 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to inbox
              </button>
            )}
            {selectedId ? (
              <StaffThreadView
                threadId={selectedId}
                user={selectedUser ?? undefined}
                onChanged={fetchThreads}
              />
            ) : (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg flex flex-col items-center justify-center min-h-[400px] text-center px-6">
                <Inbox className="w-10 h-10 text-[#2a2a2a] mb-3" />
                <p className="text-white font-medium mb-1">
                  No conversation selected
                </p>
                <p className="text-sm text-[#a1a1a1]">
                  Message an applicant or creator from their application or
                  profile.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <MessageUserModal
        open={messageModalOpen}
        onClose={() => setMessageModalOpen(false)}
        onSent={handleSent}
      />
      <BroadcastComposeModal
        open={broadcastModalOpen}
        onClose={() => setBroadcastModalOpen(false)}
      />
    </div>
  );
}
