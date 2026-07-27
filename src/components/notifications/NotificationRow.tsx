"use client";

// Expandable notification card used on /messages. Collapsed = icon + title +
// one-line preview; expanded = full body, moderation metadata, and contextual
// CTAs. Bodies are plain text — rendered as React text nodes only (XSS-safe).

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Loader2,
  Megaphone,
  MessageSquare,
  Music,
  Sliders,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { ReplyToNotificationModal } from "@/components/notifications/ReplyToNotificationModal";
import { useUser } from "@/lib/hooks/useUser";

export type AppNotificationType =
  | "APPLICATION_APPROVED"
  | "APPLICATION_DENIED"
  | "SAMPLE_APPROVED"
  | "SAMPLE_REJECTED"
  | "SAMPLE_REMOVED"
  | "PRESET_APPROVED"
  | "PRESET_REJECTED"
  | "PRESET_REMOVED"
  | "BROADCAST";

export interface NotificationMetadata {
  reviewNote?: string | null;
  count?: number;
  itemNames?: string[];
}

// Shape returned by GET /api/notifications. Named AppNotification because the
// generated Prisma `Notification` type shadows the DOM global of the same name.
export interface AppNotification {
  id: string;
  type: AppNotificationType;
  title: string;
  body: string | null;
  contextType: string | null;
  contextId: string | null;
  metadata: NotificationMetadata | null;
  broadcastId: string | null;
  threadId: string | null;
  readAt: string | null;
  createdAt: string;
  broadcast?: { subject: string; body: string } | null;
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Same icon mapping as the NotificationBell panel.
const TYPE_ICONS: Record<
  AppNotificationType,
  { Icon: LucideIcon; className: string }
> = {
  APPLICATION_APPROVED: { Icon: BadgeCheck, className: "text-[#39b54a]" },
  APPLICATION_DENIED: { Icon: XCircle, className: "text-red-400" },
  SAMPLE_APPROVED: { Icon: Music, className: "text-[#39b54a]" },
  SAMPLE_REJECTED: { Icon: Music, className: "text-red-400" },
  SAMPLE_REMOVED: { Icon: Music, className: "text-red-400" },
  PRESET_APPROVED: { Icon: Sliders, className: "text-[#39b54a]" },
  PRESET_REJECTED: { Icon: Sliders, className: "text-red-400" },
  PRESET_REMOVED: { Icon: Sliders, className: "text-red-400" },
  BROADCAST: { Icon: Megaphone, className: "text-[#39b54a]" },
};

const PRIMARY_CTA_CLASS =
  "inline-flex items-center gap-1.5 bg-[#39b54a] text-black hover:bg-[#2e9140] rounded-md px-3 py-1.5 text-sm font-medium";
const GHOST_CTA_CLASS =
  "inline-flex items-center gap-1.5 text-sm text-[#a1a1a1] hover:text-white";

interface NotificationRowProps {
  notification: AppNotification;
  expanded: boolean;
  onToggle: (id: string) => void;
  onRead: (id: string) => void;
  onThreadCreated: (threadId: string) => void;
}

export function NotificationRow({
  notification,
  expanded,
  onToggle,
  onRead,
  onThreadCreated,
}: NotificationRowProps) {
  const router = useRouter();
  const { refreshUser } = useUser();
  const [modalOpen, setModalOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const markedRef = useRef(false);

  const unread = !notification.readAt;

  // Expanding an unread row marks it read (parent POSTs + refreshes badges).
  useEffect(() => {
    if (expanded && unread && !markedRef.current) {
      markedRef.current = true;
      onRead(notification.id);
    }
  }, [expanded, unread, notification.id, onRead]);

  const { Icon, className: iconClass } =
    TYPE_ICONS[notification.type] ?? TYPE_ICONS.BROADCAST;

  const metadata = notification.metadata;
  // Broadcast content ships inline on the list response — nothing to fetch.
  const fullBody =
    notification.type === "BROADCAST"
      ? notification.broadcast?.body ?? notification.body
      : notification.body;
  // Denied applications store the review note as BOTH body and
  // metadata.reviewNote — render it once, as the blockquote.
  const showBody = Boolean(
    fullBody && fullBody !== metadata?.reviewNote
  );

  const isModeration =
    notification.type.startsWith("SAMPLE_") ||
    notification.type.startsWith("PRESET_");

  const askLabel =
    notification.type === "BROADCAST"
      ? "Reply privately"
      : notification.type === "APPLICATION_DENIED"
        ? "Ask about this decision"
        : "Ask about this";

  const handleGoToStudio = async () => {
    if (navigating) return;
    setNavigating(true);
    try {
      // Role promotion happened server-side; UserContext only refetches on
      // auth events, so without this the creator dashboard gates us out.
      await refreshUser();
    } finally {
      router.push("/creator/dashboard");
    }
  };

  const extraCount =
    typeof metadata?.count === "number" && metadata.itemNames
      ? metadata.count - metadata.itemNames.length
      : 0;

  return (
    <div
      className={`rounded-lg border transition-colors ${
        unread
          ? "border-[#39b54a]/40 bg-[#39b54a]/5"
          : "border-[#2a2a2a] bg-[#1a1a1a]"
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(notification.id)}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
      >
        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{notification.title}</p>
          {!expanded && fullBody && (
            <p className="text-xs text-[#a1a1a1] truncate mt-0.5">{fullBody}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <span className="text-xs text-[#666]">
            {timeAgo(notification.createdAt)}
          </span>
          {unread && (
            <span className="w-2 h-2 rounded-full bg-[#39b54a] flex-shrink-0" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pl-12">
          {showBody && (
            <p className="text-sm text-[#a1a1a1] whitespace-pre-wrap break-words">
              {fullBody}
            </p>
          )}

          {metadata?.reviewNote && (
            <blockquote className="border-l-2 border-[#39b54a] pl-3 italic text-sm text-[#a1a1a1] mt-3 whitespace-pre-wrap break-words">
              {metadata.reviewNote}
            </blockquote>
          )}

          {metadata?.itemNames && metadata.itemNames.length > 0 && (
            <ul className="mt-3 text-sm text-[#a1a1a1] list-disc list-inside space-y-0.5">
              {metadata.itemNames.map((name, i) => (
                <li key={`${name}-${i}`} className="break-words">
                  {name}
                </li>
              ))}
              {extraCount > 0 && (
                <li className="list-none text-[#666] italic">
                  +{extraCount} more
                </li>
              )}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-4 mt-4">
            {notification.type === "APPLICATION_DENIED" && (
              <Link href="/creator/apply" className={PRIMARY_CTA_CLASS}>
                Update application
              </Link>
            )}

            {notification.type === "APPLICATION_APPROVED" && (
              <button
                type="button"
                onClick={handleGoToStudio}
                disabled={navigating}
                className={`${PRIMARY_CTA_CLASS} disabled:opacity-50 disabled:pointer-events-none`}
              >
                {navigating && <Loader2 className="w-4 h-4 animate-spin" />}
                Go to Creator Studio
              </button>
            )}

            {isModeration && (
              <Link href="/creator/dashboard" className={PRIMARY_CTA_CLASS}>
                View my uploads
              </Link>
            )}

            {notification.type !== "APPLICATION_APPROVED" &&
              (notification.threadId ? (
                <Link
                  href={`/messages/${notification.threadId}`}
                  className={GHOST_CTA_CLASS}
                >
                  <MessageSquare className="w-4 h-4" />
                  View conversation
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className={GHOST_CTA_CLASS}
                >
                  <MessageSquare className="w-4 h-4" />
                  {askLabel}
                </button>
              ))}
          </div>
        </div>
      )}

      <ReplyToNotificationModal
        notification={{ id: notification.id, title: notification.title }}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(threadId) => {
          setModalOpen(false);
          onThreadCreated(threadId);
        }}
      />
    </div>
  );
}
