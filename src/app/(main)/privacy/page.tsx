export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h1 className="text-4xl font-bold text-white mb-8">Privacy Policy</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-[#a1a1a1]">
          <p className="text-sm">Effective Date: April 2026</p>

          <h2 className="text-xl font-semibold text-white mt-8">1. Overview</h2>
          <p>
            This Privacy Policy describes how Greenroom (&quot;Greenroom&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses,
            and discloses information when you use our platform. By using Greenroom, you agree to this Privacy Policy.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">2. Information We Collect</h2>

          <p><strong className="text-white">2.1 Account Information.</strong> When you create an account, we may collect:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Name</li>
            <li>Username</li>
            <li>Email address</li>
            <li>Password</li>
            <li>Billing address</li>
          </ul>

          <p><strong className="text-white">2.2 Creator Information.</strong> If you are a Creator, we may collect:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Payment information via third-party providers (e.g., Stripe Connect)</li>
            <li>Account and payout details</li>
          </ul>

          <p><strong className="text-white">2.3 Payment Information.</strong> Payments are processed through third-party providers such as Stripe (and potentially PayPal in the future). Greenroom does not store full payment card details.</p>

          <p><strong className="text-white">2.4 Usage &amp; Device Data.</strong> We automatically collect:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>IP address</li>
            <li>Device and browser information</li>
            <li>Platform usage (downloads, plays, interactions)</li>
          </ul>

          <p><strong className="text-white">2.5 Cookies &amp; Tracking Technologies.</strong> We use cookies and similar technologies for:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Platform functionality</li>
            <li>Analytics</li>
            <li>Advertising and marketing</li>
          </ul>
          <p>This includes tools such as Google Analytics, Facebook Pixel, and TikTok Pixel.</p>

          <h2 className="text-xl font-semibold text-white mt-8">3. How We Use Information</h2>
          <p>We use your information to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Create and manage accounts</li>
            <li>Process payments and subscriptions</li>
            <li>Provide and improve platform functionality</li>
            <li>Monitor usage and prevent fraud</li>
            <li>Communicate with users</li>
            <li>Deliver marketing and promotional content (with opt-out options)</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">4. Sharing of Information</h2>
          <p>We may share your information with:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Payment processors (e.g., Stripe)</li>
            <li>Analytics and advertising providers</li>
            <li>Service providers necessary to operate the platform</li>
          </ul>
          <p>We do not sell your personal information.</p>

          <h2 className="text-xl font-semibold text-white mt-8">5. Data Storage &amp; Transfers</h2>
          <p>Your data may be stored and processed in:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Canada</li>
            <li>The United States</li>
            <li>Other jurisdictions where our service providers operate</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">6. Data Retention</h2>
          <p>We retain your information:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>For as long as your account is active</li>
            <li>Until you request deletion</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">7. Your Rights</h2>
          <p>You may:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Access your account information</li>
            <li>Update your information</li>
            <li>Delete your account at any time</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">8. Security</h2>
          <p>We use commercially reasonable and industry-standard measures to protect your information.</p>

          <h2 className="text-xl font-semibold text-white mt-8">9. Age Restrictions</h2>
          <p>Greenroom is intended for users aged 18 and older.</p>

          <h2 className="text-xl font-semibold text-white mt-8">10. Marketing &amp; Communications</h2>
          <p>You may receive promotional emails from Greenroom. You can opt out at any time.</p>

          <h2 className="text-xl font-semibold text-white mt-8">11. Cookies &amp; Tracking Choices</h2>
          <p>You may adjust browser settings to disable cookies.</p>

          <h2 className="text-xl font-semibold text-white mt-8">12. International Users</h2>
          <p>Users may have additional rights depending on jurisdiction.</p>

          <h2 className="text-xl font-semibold text-white mt-8">13. Changes to This Policy</h2>
          <p>We may update this Privacy Policy at any time.</p>

          <h2 className="text-xl font-semibold text-white mt-8">14. Contact</h2>
          <p>
            Questions about privacy? Contact us at{" "}
            <a href="mailto:privacy@greenroom.fm" className="text-[#39b54a] hover:underline">privacy@greenroom.fm</a>
          </p>
          <p className="text-sm">Location: British Columbia, Canada</p>
        </div>
      </div>
    </div>
  );
}
