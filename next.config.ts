import type { NextConfig } from "next";

// Baseline security response headers applied to every route. These are the
// low-risk, broadly-compatible set; a Content-Security-Policy is intentionally
// omitted here until it can be tuned against Stripe.js/Supabase in Report-Only.
const securityHeaders = [
  // Force HTTPS for two years (ignored by browsers over plain http, e.g. localhost).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Don't let browsers MIME-sniff responses (the download routes stream user bytes).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Clickjacking protection for the authenticated /admin and /mod one-click actions.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
