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
import { sendEmail, ADMIN_EMAIL, EMAIL_SITE_URL } from "@/lib/email";
import {
  wrapEmailHtml,
  emailHeading,
  emailLede,
  emailButton,
  emailQuote,
  escapeHtml,
  EMAIL_COLORS,
  EMAIL_FONTS,
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
  parseReviewNote,
  REVIEW_NOTE_MAX,
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
  items: ModeratedItem[],
  reviewNote?: string | null
): Promise<void> {
  try {
    const rows = groupModerationByCreator(kind, action, items, reviewNote);
    if (rows.length === 0) return;
    await createNotificationsGrouped(prisma, rows);
    for (const row of rows) {
      await sendUploadsReviewedEmailSafe(row.userId, reviewNote);
    }
  } catch (error) {
    console.error("notifyModerationSafe error:", error);
  }
}

// ── Creator application lifecycle ────────────────────────────────────────────

// New/resubmitted application: give every moderator and admin an in-app
// notification pointing at the review queue, plus one throttled alert email to
// the admin inbox (a burst of applications shouldn't produce a burst of
// email — the queue link covers them all). Never throws.
export async function notifyApplicationSubmittedSafe(input: {
  applicationId: string;
  applicantUserId: string;
  artistName: string;
  resubmission: boolean;
}): Promise<void> {
  try {
    const staff = await prisma.user.findMany({
      where: { role: { in: ["MODERATOR", "ADMIN"] } },
      select: { id: true },
    });

    const title = input.resubmission
      ? `Updated creator application: ${input.artistName}`
      : `New creator application: ${input.artistName}`;

    await createNotificationsGrouped(
      prisma,
      staff.map((s) => ({
        userId: s.id,
        type: "APPLICATION_SUBMITTED" as const,
        title,
        contextType: "CreatorApplication",
        contextId: input.applicationId,
        metadata: {
          artistName: input.artistName,
          applicantUserId: input.applicantUserId,
          resubmission: input.resubmission,
        },
      }))
    );

    if (!(await isApplicationAdminEmailThrottled())) {
      // artistName is applicant-supplied — escape it before it hits email HTML.
      await trySendAlertEmail(ADMIN_EMAIL, {
        subject: input.resubmission
          ? "A creator application was updated on Greenroom"
          : "New creator application on Greenroom",
        heading: input.resubmission
          ? "Application resubmitted"
          : "New application",
        lede: `${escapeHtml(input.artistName)} ${input.resubmission ? "updated their" : "submitted a"} creator application. It's waiting in the review queue.`,
        ledeText: `${input.artistName} ${input.resubmission ? "updated their" : "submitted a"} creator application. It's waiting in the review queue.`,
        ctaPath: "/mod/applications",
        ctaLabel: "Review applications",
        whyReceiving:
          "You're receiving this because you're listed as the Greenroom platform admin.",
      });
    }
  } catch (error) {
    console.error("notifyApplicationSubmittedSafe error:", error);
  }
}

// Confirmation to the applicant that their application landed. Transactional
// (a direct receipt of their own action) — always sends, no throttle.
export async function sendApplicationReceivedEmailSafe(
  userId: string,
  resubmission: boolean
): Promise<void> {
  const email = await resolveEmail(userId).catch(() => null);
  if (!email) return;
  await trySendAlertEmail(email, {
    subject: resubmission
      ? "We received your updated Greenroom creator application"
      : "We received your Greenroom creator application",
    heading: "Application received",
    lede: resubmission
      ? "Thanks for updating your application. Our team reviews every submission by hand — we'll email you as soon as there's a decision."
      : "Thanks for applying to become a Greenroom creator. Our team reviews every application by hand — we'll email you as soon as there's a decision.",
    ctaPath: "/creator/apply",
    ctaLabel: "View application status",
    whyReceiving: "You applied to become a Greenroom creator.",
  });
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

// Shared throttle for the admin "application submitted" alert — one key for
// the whole queue, not per applicant, so a signup wave sends one email.
async function isApplicationAdminEmailThrottled(): Promise<boolean> {
  try {
    const rl = await rateLimit("notif-email:admin-applications", EMAIL_THROTTLE);
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
  lede: string; // rendered into HTML — escape any user-supplied fragments
  ledeText?: string; // plain-text override when lede carries HTML escapes
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
      text: `${alert.heading}\n\n${alert.ledeText ?? alert.lede}${alert.extraText ? `\n\n${alert.extraText}` : ""}\n\n${EMAIL_SITE_URL}${alert.ctaPath}`,
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

// Numbered next-steps block used by the creator onboarding (approval) email.
function emailSteps(steps: Array<{ title: string; detail: string }>): string {
  const rows = steps
    .map(
      (s, i) => `<tr>
<td valign="top" width="36" style="padding:0 12px 16px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="width:28px;height:28px;background:${EMAIL_COLORS.accent};border-radius:14px;color:#000000;font-family:${EMAIL_FONTS.body};font-size:14px;font-weight:700;line-height:28px;">${i + 1}</td></tr></table></td>
<td valign="top" style="padding:0 0 16px;">
<p style="margin:0 0 2px;color:${EMAIL_COLORS.textPrimary};font-family:${EMAIL_FONTS.body};font-size:15px;font-weight:600;">${s.title}</p>
<p style="margin:0;color:${EMAIL_COLORS.textSecondary};font-family:${EMAIL_FONTS.body};font-size:14px;line-height:1.5;">${s.detail}</p>
</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">${rows}</table>`;
}

const CREATOR_ONBOARDING_STEPS = [
  {
    title: "Upload your first sample pack",
    detail:
      "Head to Creator Studio and upload samples or a full pack — they go live after a quick review.",
  },
  {
    title: "Add presets alongside your sounds",
    detail: "Presets sell for credits too, and you set the price.",
  },
  {
    title: "Set up earnings & payouts",
    detail:
      "Check the Earnings tab so your payout details are ready before your first sale.",
  },
];

// Application decisions always email (this is the "silent decision" gap being
// fixed) — no throttle. Approval doubles as the creator onboarding email with
// concrete first steps; the denial includes the moderator's reason.
export async function sendApplicationDecisionEmailSafe(
  userId: string,
  decision: "approved" | "denied",
  reviewNote?: string | null
): Promise<void> {
  const email = await resolveEmail(userId).catch(() => null);
  if (!email) return;

  if (decision === "approved") {
    await trySendAlertEmail(email, {
      subject: "Welcome to Greenroom — your creator application was approved",
      heading: "You're in",
      lede: "Your creator application was approved. Your Creator Studio is live — here's how to get set up:",
      extraHtml: emailSteps(CREATOR_ONBOARDING_STEPS),
      extraText: CREATOR_ONBOARDING_STEPS.map(
        (s, i) => `${i + 1}. ${s.title} — ${s.detail}`
      ).join("\n"),
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

// Moderation update alert — throttled per recipient. When the moderator left a
// reason it rides along: a creator who has to revise an upload shouldn't have to
// come back to the site just to learn what was wrong.
export async function sendUploadsReviewedEmailSafe(
  userId: string,
  reviewNote?: string | null
): Promise<void> {
  if (await isEmailThrottled(userId)) return;
  const email = await resolveEmail(userId).catch(() => null);
  if (!email) return;
  const note = reviewNote?.trim() || null;
  await trySendAlertEmail(email, {
    subject: "Updates on your Greenroom uploads",
    heading: "Your uploads were reviewed",
    lede: note
      ? "There's an update on one or more of your uploads. The review team left a note:"
      : "There's an update on one or more of your uploads.",
    // Moderator-authored free text — escape before it reaches email HTML.
    extraHtml: note ? emailQuote(escapeHtml(note)) : undefined,
    extraText: note ? `"${note}"` : undefined,
    ctaPath: "/creator/dashboard",
    ctaLabel: "View uploads",
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
