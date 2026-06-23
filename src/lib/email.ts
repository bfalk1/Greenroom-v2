import { Resend } from "resend";
import { prisma } from "./prisma";
import {
  wrapEmailHtml,
  emailHeading,
  emailLede,
  emailParagraph,
  emailButton,
  emailStatCard,
  EMAIL_COLORS,
  EMAIL_FONTS,
} from "./email-layout";

// Lazy-initialize Resend to avoid build errors when API key is missing
let resend: Resend | null = null;

function getResend() {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// Admin email for contact form and notifications
export const ADMIN_EMAIL = "admin@greenroom.fm";
const FROM_EMAIL = "Greenroom <admin@greenroom.fm>";
// Sender for invite emails (creator invites, beta invites, premium invites).
// Uses the invite.greenroom.fm subdomain so invite traffic is isolated from
// transactional/admin mail reputation-wise.
export const INVITE_FROM_EMAIL = "Greenroom <greenroom@invite.greenroom.fm>";

// Canonical site URL used in outbound emails. Hardcoded so preview/staging
// deployments don't leak non-brand URLs (e.g. *.vercel.app) into user inboxes.
export const EMAIL_SITE_URL = "https://greenroom.fm";

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  from?: string;
  // When true, this is a marketing/promotional send and is suppressed for
  // recipients who have unsubscribed (User.emailOptOutAt set). Transactional
  // email (payouts, invites, receipts) must NOT set this — those always send.
  marketing?: boolean;
}

// Returns true if the recipient has unsubscribed from marketing email.
export async function isEmailUnsubscribed(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { emailOptOutAt: true },
  });
  return Boolean(user?.emailOptOutAt);
}

interface SendTemplateEmailOptions {
  to: string;
  subject: string;
  templateId: string;
  variables?: Record<string, string | number>;
  replyTo?: string;
}

export async function sendEmail(options: SendEmailOptions) {
  // Honor unsubscribes for marketing email. Transactional sends omit `marketing`
  // and always go out.
  if (options.marketing && (await isEmailUnsubscribed(options.to))) {
    console.log(`[Email] Skipping marketing send to ${options.to} — unsubscribed`);
    return null;
  }

  const unsubscribeUrl = `${EMAIL_SITE_URL}/unsubscribe?email=${encodeURIComponent(options.to)}`;
  
  // Add unsubscribe link to HTML emails if not already present
  let html = options.html;
  if (html) {
    // Replace Resend template placeholder with actual URL
    html = html.replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, unsubscribeUrl);
    
    // Add unsubscribe link if not present
    if (!html.includes("unsubscribe") && !html.includes("Unsubscribe")) {
      html = html.replace(
        /<\/div>\s*$/, 
        `<p style="color: #444444; font-size: 11px; text-align: center; margin-top: 16px;"><a href="${unsubscribeUrl}" style="color: #444444;">Unsubscribe</a></p></div>`
      );
    }
  }

  // Add unsubscribe to plain text
  let text = options.text;
  text = text.replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, unsubscribeUrl);
  if (!text.toLowerCase().includes("unsubscribe")) {
    text += `\n\n---\nUnsubscribe: ${unsubscribeUrl}`;
  }

  const { data, error } = await getResend().emails.send({
    from: options.from || FROM_EMAIL,
    to: options.to,
    replyTo: options.replyTo,
    subject: options.subject,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (error) {
    console.error("Resend error:", error);
    throw new Error(error.message);
  }

  return data;
}

// Send email using a Resend template
export async function sendTemplateEmail(options: SendTemplateEmailOptions) {
  const unsubscribeUrl = `${EMAIL_SITE_URL}/unsubscribe?email=${encodeURIComponent(options.to)}`;

  const { data, error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to: options.to,
    replyTo: options.replyTo,
    subject: options.subject,
    template: {
      id: options.templateId,
      variables: {
        ...options.variables,
        unsubscribe_url: unsubscribeUrl,
      },
    },
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (error) {
    console.error("Resend template error:", error);
    throw new Error(error.message);
  }

  return data;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Contact form email
export async function sendContactEmail(name: string, email: string, message: string) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message);

  const content = `
${emailHeading("New contact message")}
${emailLede(`${safeName} sent a message through the Greenroom contact form.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="background:${EMAIL_COLORS.surfaceElevated};border:1px solid ${EMAIL_COLORS.border};border-radius:12px;padding:20px;">
<p style="margin:0 0 8px;color:${EMAIL_COLORS.textSecondary};font-family:${EMAIL_FONTS.body};font-size:14px;"><strong style="color:${EMAIL_COLORS.textPrimary};">From:</strong> ${safeName}</p>
<p style="margin:0;color:${EMAIL_COLORS.textSecondary};font-family:${EMAIL_FONTS.body};font-size:14px;"><strong style="color:${EMAIL_COLORS.textPrimary};">Email:</strong> <a href="mailto:${safeEmail}" style="color:${EMAIL_COLORS.accent};">${safeEmail}</a></p>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${EMAIL_COLORS.surface};border:1px solid ${EMAIL_COLORS.border};border-radius:12px;padding:20px;">
<p style="margin:0 0 8px;color:${EMAIL_COLORS.textSecondary};font-family:${EMAIL_FONTS.body};font-size:13px;text-transform:uppercase;letter-spacing:1px;">Message</p>
<p style="margin:0;color:${EMAIL_COLORS.textPrimary};font-family:${EMAIL_FONTS.body};font-size:15px;line-height:1.6;white-space:pre-wrap;">${safeMessage}</p>
</td></tr></table>
`;

  return sendEmail({
    to: ADMIN_EMAIL,
    replyTo: email,
    subject: `Contact from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
    html: wrapEmailHtml({
      preheader: `${name} sent a message through the Greenroom contact form.`,
      content,
      whyReceiving: "You're receiving this because a visitor submitted the Greenroom contact form.",
    }),
  });
}

// Payout notification to creator
export async function sendPayoutNotification(
  creatorEmail: string,
  creatorName: string,
  amountUsd: number,
  periodStart: Date,
  _periodEnd: Date
) {
  const periodStr = `${periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
  const safeName = escapeHtml(creatorName);
  const amountStr = `$${amountUsd.toFixed(2)}`;

  const content = `
${emailHeading("Payout sent")}
${emailLede(`Hi ${safeName}, your ${periodStr} payout is on its way.`)}
${emailStatCard(amountStr, `Sent for ${periodStr}`)}
${emailParagraph("Your payout has been sent to your connected Stripe account. Funds typically arrive within 2–3 business days.")}
${emailButton(`${EMAIL_SITE_URL}/creator/earnings`, "View earnings")}
${emailParagraph("Thanks for being part of Greenroom.", EMAIL_COLORS.textSecondary)}
`;

  return sendEmail({
    to: creatorEmail,
    subject: `Your Greenroom payout of ${amountStr} has been sent`,
    text: `Hi ${creatorName},

Your Greenroom payout of ${amountStr} for ${periodStr} has been sent to your connected Stripe account.

The funds should arrive in your bank account within 2-3 business days.

View your earnings: ${EMAIL_SITE_URL}/creator/earnings

---
You're receiving this because you have an active Greenroom creator account.

© Greenroom`,
    html: wrapEmailHtml({
      preheader: `Your ${periodStr} payout of ${amountStr} is on its way.`,
      content,
      whyReceiving: "You're receiving this because you have an active Greenroom creator account.",
    }),
  });
}

// Payout failed notification to creator
export async function sendPayoutFailedNotification(
  creatorEmail: string,
  creatorName: string,
  amountUsd: number,
  reason?: string
) {
  const safeName = escapeHtml(creatorName);
  const safeReason = reason ? escapeHtml(reason) : "";
  const amountStr = `$${amountUsd.toFixed(2)}`;

  const reasonBlock = safeReason
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="background:${EMAIL_COLORS.surface};border-left:3px solid ${EMAIL_COLORS.accent};padding:16px 20px;border-radius:0 6px 6px 0;">
<p style="margin:0;color:${EMAIL_COLORS.textSecondary};font-family:${EMAIL_FONTS.body};font-size:14px;line-height:1.6;"><strong style="color:${EMAIL_COLORS.textPrimary};">Reason:</strong> ${safeReason}</p>
</td></tr></table>`
    : "";

  const content = `
${emailHeading("Payout issue")}
${emailLede(`Hi ${safeName}, we ran into a problem sending your payout of ${amountStr}.`)}
${reasonBlock}
${emailParagraph("Please check your Stripe Connect settings to make sure your account is properly configured. We'll retry the payout automatically once resolved.")}
${emailButton(`${EMAIL_SITE_URL}/creator/earnings`, "Check settings")}
${emailParagraph(`Need help? Reply to this email or write to <a href="mailto:${ADMIN_EMAIL}" style="color:${EMAIL_COLORS.accent};">${ADMIN_EMAIL}</a>.`, EMAIL_COLORS.textSecondary)}
`;

  return sendEmail({
    to: creatorEmail,
    replyTo: ADMIN_EMAIL,
    subject: `Your Greenroom payout needs attention`,
    text: `Hi ${creatorName},

We tried to send your Greenroom payout of ${amountStr} but ran into an issue.

${reason ? `Reason: ${reason}\n\n` : ""}Please check your Stripe Connect settings to make sure your account is properly configured. We'll retry automatically once resolved.

Check settings: ${EMAIL_SITE_URL}/creator/earnings

If you need help, reply to this email or write to ${ADMIN_EMAIL}.

---
You're receiving this because you have an active Greenroom creator account.

© Greenroom`,
    html: wrapEmailHtml({
      preheader: `Your payout of ${amountStr} needs attention.`,
      content,
      whyReceiving: "You're receiving this because you have an active Greenroom creator account.",
    }),
  });
}

// Admin notification for payout summary
export async function sendPayoutSummaryToAdmin(summary: {
  processed: number;
  payoutsQueued: number;
  totalAmountUsd: number;
  skippedBelowThreshold: number;
  errors: string[];
}) {
  const hasErrors = summary.errors.length > 0;
  const totalStr = `$${summary.totalAmountUsd.toFixed(2)}`;

  const errorsBlock = hasErrors
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="background:${EMAIL_COLORS.surface};border-left:3px solid ${EMAIL_COLORS.accent};padding:16px 20px;border-radius:0 6px 6px 0;">
<p style="margin:0 0 10px;color:${EMAIL_COLORS.textPrimary};font-family:${EMAIL_FONTS.body};font-size:14px;font-weight:700;">Errors (${summary.errors.length})</p>
${summary.errors.map(e => `<p style="margin:0 0 4px;color:${EMAIL_COLORS.textSecondary};font-family:${EMAIL_FONTS.body};font-size:13px;line-height:1.5;">• ${escapeHtml(e)}</p>`).join("")}
</td></tr></table>`
    : "";

  const content = `
${emailHeading("Monthly payout summary")}
${emailLede(`Processed ${summary.processed} creators · queued ${summary.payoutsQueued} payouts for approval · total ${totalStr}. Approve them in the admin payouts panel.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr>
<td width="50%" valign="top" style="padding-right:6px;">${emailStatCard(String(summary.payoutsQueued), "Payouts queued")}</td>
<td width="50%" valign="top" style="padding-left:6px;">${emailStatCard(totalStr, "Total queued")}</td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="background:${EMAIL_COLORS.surfaceElevated};border:1px solid ${EMAIL_COLORS.border};border-radius:12px;padding:20px;">
<p style="margin:0 0 8px;color:${EMAIL_COLORS.textSecondary};font-family:${EMAIL_FONTS.body};font-size:14px;"><strong style="color:${EMAIL_COLORS.textPrimary};">Creators processed:</strong> ${summary.processed}</p>
<p style="margin:0;color:${EMAIL_COLORS.textSecondary};font-family:${EMAIL_FONTS.body};font-size:14px;"><strong style="color:${EMAIL_COLORS.textPrimary};">Below minimum:</strong> ${summary.skippedBelowThreshold}</p>
</td></tr></table>
${errorsBlock}
`;

  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `Monthly payouts — ${summary.payoutsQueued} queued for approval${hasErrors ? " (with errors)" : ""}`,
    text: `Monthly Payout Summary

Processed: ${summary.processed} creators
Payouts Queued (awaiting admin approval): ${summary.payoutsQueued}
Total Queued: ${totalStr}
Skipped (below minimum): ${summary.skippedBelowThreshold}
${hasErrors ? `\nErrors:\n${summary.errors.join("\n")}` : ""}

---
Automated admin summary from Greenroom.`,
    html: wrapEmailHtml({
      preheader: `${summary.payoutsQueued} payouts queued for approval · total ${totalStr}.`,
      content,
      whyReceiving: "You're receiving this because you're listed as the Greenroom platform admin.",
    }),
  });
}
