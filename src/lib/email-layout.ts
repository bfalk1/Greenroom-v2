// Shared email layout primitives. Every outbound template passes its body
// content through `wrapEmailHtml` so the fonts, header, footer, and
// "why you're receiving this" line stay uniform across invites and
// transactional mail. Keeps brand typography (Waukegan LDO, our Eurostile
// analogue) consistent without each template re-declaring @font-face.

export const EMAIL_COLORS = {
  bg: "#000000",
  surface: "#111111",
  surfaceElevated: "#1a1a1a",
  border: "#222222",
  textPrimary: "#ffffff",
  textSecondary: "#a1a1a1",
  textTertiary: "#888888",
  textMuted: "#666666",
  accent: "#39b54a",
  accentText: "#000000",
  gold: "#d4af37",
} as const;

export const EMAIL_FONTS = {
  body: "'Waukegan LDO',Arial,Helvetica,sans-serif",
  display: "'Waukegan LDO Extended','Waukegan LDO','Arial Black',Arial,Helvetica,sans-serif",
} as const;

const FONT_FACE_CSS = `
@font-face{font-family:'Waukegan LDO';src:url('https://greenroom.fm/fonts/email/waukegan-ldo-regular.ttf') format('truetype');font-weight:400;font-style:normal;font-display:swap;}
@font-face{font-family:'Waukegan LDO';src:url('https://greenroom.fm/fonts/email/waukegan-ldo-bold.ttf') format('truetype');font-weight:700;font-style:normal;font-display:swap;}
@font-face{font-family:'Waukegan LDO Extended';src:url('https://greenroom.fm/fonts/email/waukegan-ldo-extended-bold.ttf') format('truetype');font-weight:700;font-style:normal;font-display:swap;}
`.trim();

export interface EmailLayoutOptions {
  preheader?: string;
  content: string;
  whyReceiving: string;
  variant?: "default" | "premium";
}

export function wrapEmailHtml({
  preheader,
  content,
  whyReceiving,
  variant = "default",
}: EmailLayoutOptions): string {
  const isPremium = variant === "premium";
  const footerBrand = isPremium ? "© Greenroom · Premium" : "© Greenroom";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Greenroom</title>
<style>
${FONT_FACE_CSS}
body{margin:0;padding:0;background:${EMAIL_COLORS.bg};}
a{color:${EMAIL_COLORS.accent};}
@media(max-width:640px){
.gr-container{width:100%!important;}
.gr-padded{padding:24px!important;}
.gr-h1{font-size:26px!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background:${EMAIL_COLORS.bg};font-family:${EMAIL_FONTS.body};color:${EMAIL_COLORS.textPrimary};">
${preheader ? `<div style="display:none;font-size:1px;color:${EMAIL_COLORS.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_COLORS.bg};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" class="gr-container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${EMAIL_COLORS.bg};">
<tr><td align="center" style="padding:8px 0 24px;">
<a href="https://greenroom.fm" style="text-decoration:none;"><img src="https://greenroom.fm/email/logo-white.png" width="200" alt="Greenroom" style="display:block;border:0;max-width:200px;height:auto;"></a>
</td></tr>
<tr><td class="gr-padded" style="padding:16px 40px 40px;">
${content}
</td></tr>
<tr><td class="gr-padded" style="padding:24px 40px;text-align:center;border-top:1px solid ${EMAIL_COLORS.border};">
<p style="margin:0 0 10px;color:${EMAIL_COLORS.textTertiary};font-size:12px;font-family:${EMAIL_FONTS.body};line-height:1.5;">${escapeHtml(whyReceiving)}</p>
<p style="margin:0;color:${EMAIL_COLORS.textMuted};font-size:12px;font-family:${EMAIL_FONTS.body};">${footerBrand} · <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:${EMAIL_COLORS.textTertiary};text-decoration:underline;">Unsubscribe</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function emailHeading(text: string): string {
  return `<h1 class="gr-h1" style="margin:0 0 16px;color:${EMAIL_COLORS.textPrimary};font-family:${EMAIL_FONTS.display};font-size:32px;font-weight:700;line-height:1.2;letter-spacing:-0.5px;">${text}</h1>`;
}

export function emailLede(text: string): string {
  return `<p style="margin:0 0 28px;color:${EMAIL_COLORS.textSecondary};font-family:${EMAIL_FONTS.body};font-size:16px;line-height:1.6;">${text}</p>`;
}

export function emailParagraph(text: string, color: string = EMAIL_COLORS.textPrimary): string {
  return `<p style="margin:0 0 16px;color:${color};font-family:${EMAIL_FONTS.body};font-size:15px;line-height:1.6;">${text}</p>`;
}

export function emailButton(
  href: string,
  label: string,
  variant: "default" | "premium" = "default",
): string {
  const bg = variant === "premium" ? EMAIL_COLORS.gold : EMAIL_COLORS.accent;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 8px;"><tr><td align="center" style="background:${bg};border-radius:8px;">
<a href="${href}" style="display:inline-block;background:${bg};color:#000;padding:16px 36px;font-family:${EMAIL_FONTS.display};font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:1.5px;text-transform:uppercase;">${label}</a>
</td></tr></table>`;
}

export function emailStatCard(value: string, label: string, accent: string = EMAIL_COLORS.accent): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="background:${EMAIL_COLORS.surfaceElevated};border:1px solid ${EMAIL_COLORS.border};border-radius:12px;padding:28px 24px;text-align:center;">
<p style="margin:0 0 6px;color:${accent};font-family:${EMAIL_FONTS.display};font-size:36px;font-weight:700;line-height:1;letter-spacing:-0.5px;">${value}</p>
<p style="margin:0;color:${EMAIL_COLORS.textSecondary};font-family:${EMAIL_FONTS.body};font-size:13px;line-height:1.5;">${label}</p>
</td></tr></table>`;
}

export function emailQuote(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="background:${EMAIL_COLORS.surface};border-left:3px solid ${EMAIL_COLORS.accent};padding:16px 20px;border-radius:0 6px 6px 0;">
<p style="margin:0;color:${EMAIL_COLORS.textSecondary};font-family:${EMAIL_FONTS.body};font-size:14px;font-style:italic;line-height:1.6;">${text}</p>
</td></tr></table>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
