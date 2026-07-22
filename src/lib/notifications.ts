// In-app notifications + notification alert emails.
//
// Write rules (see plan): notification writes happen AFTER the primary action
// (moderation decision, message send) commits, wrapped in try/catch by the
// caller — a bug here must never block or roll back moderation itself.
// Emails are sent after the notification write and NEVER throw; a Resend
// failure degrades to "sees it on next visit", not a lost notification.

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { sendEmail, EMAIL_SITE_URL } from "@/lib/email";
import {
  wrapEmailHtml,
  emailHeading,
  emailLede,
  emailButton,
  emailQuote,
  escapeHtml,
} from "@/lib/email-layout";
import {
  groupModerationByCreator,
  type ModeratedItem,
  type ModerationAction,
  type ModerationKind,
  type NotificationInput,
} from "@/lib/notificationFormat";

export {
  groupModerationByCreator,
  moderationTitle,
  type ModeratedItem,
  type ModerationAction,
  type ModerationKind,
  type NotificationInput,
} from "@/lib/notificationFormat";

// Accepts either the global client or a transaction client.
type Db = PrismaClient | Prisma.TransactionClient;

export async function createNotification(db: Db, input: NotificationInput) {
  return db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      contextType: input.contextType ?? null,
      contextId: input.contextId ?? null,
      metadata: input.metadata,
      broadcastId: input.broadcastId ?? null,
    },
  });
}

export async function createNotificationsGrouped(
  db: Db,
  rows: NotificationInput[]
) {
  if (rows.length === 0) return { count: 0 };
  return db.notification.createMany({
    data: rows.map((r) => ({
      userId: r.userId,
      type: r.type,
      title: r.title,
      body: r.body ?? null,
      contextType: r.contextType ?? null,
      contextId: r.contextId ?? null,
      metadata: r.metadata,
      broadcastId: r.broadcastId ?? null,
    })),
  });
}

// ── Moderation event notifications ──────────────────────────────────────────

// Convenience used by the moderation routes: write grouped notifications and
// send at most one throttled alert email per affected creator. Never throws.
export async function notifyModerationSafe(
  kind: ModerationKind,
  action: ModerationAction,
  items: ModeratedItem[]
): Promise<void> {
  try {
    const rows = groupModerationByCreator(kind, action, items);
    if (rows.length === 0) return;
    await createNotificationsGrouped(prisma, rows);
    for (const row of rows) {
      await sendUploadsReviewedEmailSafe(row.userId);
    }
  } catch (error) {
    console.error("notifyModerationSafe error:", error);
  }
}

// ── Alert emails (short pointers; content lives in-app) ─────────────────────

const EMAIL_THROTTLE = { limit: 1, windowSec: 900 }; // ≤1 alert email per user per 15 min

async function isEmailThrottled(userId: string): Promise<boolean> {
  try {
    const rl = await rateLimit(`notif-email:${userId}`, EMAIL_THROTTLE);
    return !rl.success;
  } catch {
    return false; // fail open — worst case an extra email
  }
}

async function resolveEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user?.email ?? null;
}

interface AlertEmail {
  subject: string;
  heading: string;
  lede: string;
  extraHtml?: string;
  extraText?: string;
  ctaPath: string;
  ctaLabel: string;
  whyReceiving: string;
}

async function trySendAlertEmail(to: string, alert: AlertEmail): Promise<boolean> {
  try {
    const content = `
${emailHeading(alert.heading)}
${emailLede(alert.lede)}
${alert.extraHtml ?? ""}
${emailButton(`${EMAIL_SITE_URL}${alert.ctaPath}`, alert.ctaLabel)}
`;
    await sendEmail({
      to,
      subject: alert.subject,
      text: `${alert.heading}\n\n${alert.lede}${alert.extraText ? `\n\n${alert.extraText}` : ""}\n\n${EMAIL_SITE_URL}${alert.ctaPath}`,
      html: wrapEmailHtml({
        preheader: alert.lede,
        content,
        whyReceiving: alert.whyReceiving,
      }),
    });
    return true;
  } catch (error) {
    console.error("Notification email failed:", error);
    return false;
  }
}

// Application decisions always email (this is the "silent decision" gap being
// fixed) — no throttle. The denial includes the moderator's reason.
export async function sendApplicationDecisionEmailSafe(
  userId: string,
  decision: "approved" | "denied",
  reviewNote?: string | null
): Promise<void> {
  const email = await resolveEmail(userId).catch(() => null);
  if (!email) return;

  if (decision === "approved") {
    await trySendAlertEmail(email, {
      subject: "Your Greenroom creator application was approved",
      heading: "You're in",
      lede: "Your creator application was approved — you can now upload and sell on Greenroom.",
      ctaPath: "/creator/dashboard",
      ctaLabel: "Go to Creator Studio",
      whyReceiving: "You applied to become a Greenroom creator.",
    });
  } else {
    const note = reviewNote?.trim();
    await trySendAlertEmail(email, {
      subject: "An update on your Greenroom creator application",
      heading: "Your application wasn't approved this time",
      lede: note
        ? "The review team left a note on your application:"
        : "You can update your application and resubmit.",
      extraHtml: note ? emailQuote(escapeHtml(note)) : undefined,
      extraText: note ? `"${note}"` : undefined,
      ctaPath: "/creator/apply",
      ctaLabel: "Update application",
      whyReceiving: "You applied to become a Greenroom creator.",
    });
  }
}

// Staff message alert — throttled per recipient.
export async function sendNewMessageEmailSafe(
  userId: string,
  threadId?: string
): Promise<void> {
  if (await isEmailThrottled(userId)) return;
  const email = await resolveEmail(userId).catch(() => null);
  if (!email) return;
  await trySendAlertEmail(email, {
    subject: "You have a new message on Greenroom",
    heading: "New message",
    lede: "A member of the Greenroom team sent you a message.",
    ctaPath: threadId ? `/messages/${threadId}` : "/messages",
    ctaLabel: "Read message",
    whyReceiving: "You're receiving this because you have a Greenroom account.",
  });
}

// Moderation update alert — throttled per recipient.
export async function sendUploadsReviewedEmailSafe(userId: string): Promise<void> {
  if (await isEmailThrottled(userId)) return;
  const email = await resolveEmail(userId).catch(() => null);
  if (!email) return;
  await trySendAlertEmail(email, {
    subject: "Updates on your Greenroom uploads",
    heading: "Your uploads were reviewed",
    lede: "There's an update on one or more of your uploads.",
    ctaPath: "/messages",
    ctaLabel: "View updates",
    whyReceiving: "You're receiving this because you have a Greenroom creator account.",
  });
}

// Broadcast alert — no throttle (single deliberate blast); the broadcast route
// loops recipients with spacing and collects failures. Returns success.
export async function sendBroadcastAlertEmailSafe(to: string): Promise<boolean> {
  return trySendAlertEmail(to, {
    subject: "You have a new message on Greenroom",
    heading: "New announcement",
    lede: "The Greenroom team sent an announcement to creators.",
    ctaPath: "/messages",
    ctaLabel: "Read announcement",
    whyReceiving: "You're receiving this because you have a Greenroom creator account.",
  });
}
