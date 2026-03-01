import { Resend } from "resend";

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
const FROM_EMAIL = "GREENROOM <chris@greenroom.fm>";

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export async function sendEmail(options: SendEmailOptions) {
  const unsubscribeUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://greenroom.fm"}/unsubscribe?email=${encodeURIComponent(options.to)}`;
  
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
    from: FROM_EMAIL,
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

// Contact form email
export async function sendContactEmail(name: string, email: string, message: string) {
  return sendEmail({
    to: ADMIN_EMAIL,
    replyTo: email,
    subject: `[GREENROOM] Contact from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #00FF88; margin: 0; font-size: 24px;">GREENROOM</h1>
        </div>
        <h2 style="color: #ffffff; margin-bottom: 16px;">New Contact Message</h2>
        <div style="background: #1a1a1a; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <p style="color: #a1a1a1; margin: 0 0 8px;"><strong style="color: #ffffff;">From:</strong> ${name}</p>
          <p style="color: #a1a1a1; margin: 0;"><strong style="color: #ffffff;">Email:</strong> <a href="mailto:${email}" style="color: #00FF88;">${email}</a></p>
        </div>
        <div style="background: #1a1a1a; border-radius: 8px; padding: 20px;">
          <p style="color: #a1a1a1; margin: 0 0 8px;"><strong style="color: #ffffff;">Message:</strong></p>
          <p style="color: #ffffff; margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
      </div>
    `,
  });
}

// Payout notification to creator
export async function sendPayoutNotification(
  creatorEmail: string,
  creatorName: string,
  amountUsd: number,
  periodStart: Date,
  periodEnd: Date
) {
  const periodStr = `${periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
  
  return sendEmail({
    to: creatorEmail,
    subject: `💰 GREENROOM Payout Sent - $${amountUsd.toFixed(2)}`,
    text: `Hi ${creatorName},\n\nGreat news! Your GREENROOM payout of $${amountUsd.toFixed(2)} for ${periodStr} has been sent to your connected Stripe account.\n\nThe funds should arrive in your bank account within 2-3 business days.\n\nKeep creating amazing samples!\n\n- The GREENROOM Team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #00FF88; margin: 0; font-size: 24px;">GREENROOM</h1>
        </div>
        
        <h2 style="color: #ffffff; margin-bottom: 8px;">Payout Sent! 💰</h2>
        <p style="color: #a1a1a1; margin-bottom: 24px;">Hi ${creatorName},</p>
        
        <div style="background: linear-gradient(135deg, #00FF88 0%, #00cc6a 100%); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <p style="color: #000000; margin: 0 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Amount</p>
          <p style="color: #000000; margin: 0; font-size: 36px; font-weight: bold;">$${amountUsd.toFixed(2)}</p>
          <p style="color: #000000; margin: 8px 0 0; font-size: 14px;">${periodStr}</p>
        </div>
        
        <div style="background: #1a1a1a; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #ffffff; margin: 0 0 12px;">Great news! Your payout has been sent to your connected Stripe account.</p>
          <p style="color: #a1a1a1; margin: 0; font-size: 14px;">💳 Funds typically arrive within 2-3 business days.</p>
        </div>
        
        <p style="color: #a1a1a1; margin-bottom: 24px;">Keep creating amazing samples!</p>
        
        <div style="text-align: center; padding-top: 24px; border-top: 1px solid #2a2a2a;">
          <a href="https://greenroom.fm/creator/earnings" style="display: inline-block; background: #00FF88; color: #000000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">View Earnings</a>
        </div>
        
        <p style="color: #666666; font-size: 12px; text-align: center; margin-top: 24px;">
          © GREENROOM • <a href="https://greenroom.fm" style="color: #666666;">greenroom.fm</a>
        </p>
      </div>
    `,
  });
}

// Payout failed notification to creator
export async function sendPayoutFailedNotification(
  creatorEmail: string,
  creatorName: string,
  amountUsd: number,
  reason?: string
) {
  return sendEmail({
    to: creatorEmail,
    subject: `⚠️ GREENROOM Payout Issue - Action Required`,
    text: `Hi ${creatorName},\n\nWe attempted to send your GREENROOM payout of $${amountUsd.toFixed(2)}, but encountered an issue.\n\n${reason ? `Reason: ${reason}\n\n` : ""}Please check your Stripe Connect settings to make sure your account is properly configured.\n\nIf you need help, contact us at ${ADMIN_EMAIL}.\n\n- The GREENROOM Team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #00FF88; margin: 0; font-size: 24px;">GREENROOM</h1>
        </div>
        
        <h2 style="color: #ffffff; margin-bottom: 8px;">Payout Issue ⚠️</h2>
        <p style="color: #a1a1a1; margin-bottom: 24px;">Hi ${creatorName},</p>
        
        <div style="background: #1a1a1a; border-radius: 8px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #ff6b6b;">
          <p style="color: #ffffff; margin: 0 0 12px;">We attempted to send your payout of <strong>$${amountUsd.toFixed(2)}</strong>, but encountered an issue.</p>
          ${reason ? `<p style="color: #ff6b6b; margin: 0; font-size: 14px;">Reason: ${reason}</p>` : ""}
        </div>
        
        <p style="color: #a1a1a1; margin-bottom: 24px;">Please check your Stripe Connect settings to make sure your account is properly configured. We'll retry the payout automatically once resolved.</p>
        
        <div style="text-align: center; padding-top: 24px; border-top: 1px solid #2a2a2a;">
          <a href="https://greenroom.fm/creator/earnings" style="display: inline-block; background: #00FF88; color: #000000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Check Settings</a>
        </div>
        
        <p style="color: #666666; font-size: 12px; text-align: center; margin-top: 24px;">
          Need help? Contact us at <a href="mailto:${ADMIN_EMAIL}" style="color: #00FF88;">${ADMIN_EMAIL}</a>
        </p>
      </div>
    `,
  });
}

// Admin notification for payout summary
export async function sendPayoutSummaryToAdmin(summary: {
  processed: number;
  payoutsSent: number;
  totalAmountUsd: number;
  skippedBelowThreshold: number;
  skippedNoStripe: number;
  errors: string[];
}) {
  const hasErrors = summary.errors.length > 0;
  
  return sendEmail({
    to: ADMIN_EMAIL,
    subject: `${hasErrors ? "⚠️" : "✅"} GREENROOM Monthly Payouts - ${summary.payoutsSent} sent`,
    text: `Monthly Payout Summary\n\nProcessed: ${summary.processed} creators\nPayouts Sent: ${summary.payoutsSent}\nTotal Amount: $${summary.totalAmountUsd.toFixed(2)}\nSkipped (below $50): ${summary.skippedBelowThreshold}\nSkipped (no Stripe): ${summary.skippedNoStripe}\n${hasErrors ? `\nErrors:\n${summary.errors.join("\n")}` : ""}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #00FF88; margin: 0; font-size: 24px;">GREENROOM</h1>
        </div>
        
        <h2 style="color: #ffffff; margin-bottom: 24px;">Monthly Payout Summary</h2>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
          <div style="background: #1a1a1a; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #a1a1a1; margin: 0 0 4px; font-size: 12px;">Payouts Sent</p>
            <p style="color: #00FF88; margin: 0; font-size: 24px; font-weight: bold;">${summary.payoutsSent}</p>
          </div>
          <div style="background: #1a1a1a; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #a1a1a1; margin: 0 0 4px; font-size: 12px;">Total Amount</p>
            <p style="color: #00FF88; margin: 0; font-size: 24px; font-weight: bold;">$${summary.totalAmountUsd.toFixed(2)}</p>
          </div>
        </div>
        
        <div style="background: #1a1a1a; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #a1a1a1; margin: 0 0 8px;"><strong style="color: #ffffff;">Creators Processed:</strong> ${summary.processed}</p>
          <p style="color: #a1a1a1; margin: 0 0 8px;"><strong style="color: #ffffff;">Below $50 Threshold:</strong> ${summary.skippedBelowThreshold}</p>
          <p style="color: #a1a1a1; margin: 0;"><strong style="color: #ffffff;">No Stripe Connected:</strong> ${summary.skippedNoStripe}</p>
        </div>
        
        ${hasErrors ? `
        <div style="background: #2a1a1a; border-radius: 8px; padding: 20px; border-left: 4px solid #ff6b6b;">
          <p style="color: #ff6b6b; margin: 0 0 12px; font-weight: bold;">Errors (${summary.errors.length})</p>
          ${summary.errors.map(e => `<p style="color: #a1a1a1; margin: 0 0 4px; font-size: 13px;">• ${e}</p>`).join("")}
        </div>
        ` : ""}
        
        <p style="color: #666666; font-size: 12px; text-align: center; margin-top: 24px;">
          Automated payout from GREENROOM
        </p>
      </div>
    `,
  });
}
