export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h1 className="text-4xl font-bold text-white mb-8">Privacy Policy</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-[#a1a1a1]">
          <p className="text-sm">Last updated: February 2026</p>

          <h2 className="text-xl font-semibold text-white mt-8">1. Information We Collect</h2>
          <p>We collect information you provide when creating an account (email, name, username), payment information processed securely through Stripe, and usage data such as samples browsed, purchased, and downloaded.</p>

          <h2 className="text-xl font-semibold text-white mt-8">2. How We Use Your Information</h2>
          <p>We use your information to provide and improve the platform, process subscriptions and payments, communicate with you about your account, and calculate creator payouts.</p>

          <h2 className="text-xl font-semibold text-white mt-8">3. Payment Processing</h2>
          <p>All payment processing is handled by Stripe. We do not store your credit card information. Stripe&apos;s privacy policy governs the handling of your payment data.</p>

          <h2 className="text-xl font-semibold text-white mt-8">4. Data Sharing</h2>
          <p>We do not sell your personal information. We share data only with service providers necessary to operate the platform (Supabase for hosting, Stripe for payments) and when required by law.</p>

          <h2 className="text-xl font-semibold text-white mt-8">5. Cookies</h2>
          <p>We use essential cookies for authentication and session management. No third-party tracking cookies are used.</p>

          <h2 className="text-xl font-semibold text-white mt-8">6. Data Security</h2>
          <p>We implement industry-standard security measures to protect your data, including encryption in transit and at rest. However, no method of transmission over the internet is 100% secure.</p>

          <h2 className="text-xl font-semibold text-white mt-8">7. Your Rights</h2>
          <p>You may request access to, correction of, or deletion of your personal data by contacting us. You may delete your account at any time from your account settings.</p>

          <h2 className="text-xl font-semibold text-white mt-8">8. Changes to This Policy</h2>
          <p>We may update this privacy policy at any time. We will notify you of significant changes via email or platform notification.</p>

          <h2 className="text-xl font-semibold text-white mt-8">9. Contact</h2>
          <p>Questions about privacy? Contact us at <a href="mailto:privacy@greenroom.app" className="text-[#00FF88] hover:underline">privacy@greenroom.app</a></p>
        </div>
      </div>
    </div>
  );
}
