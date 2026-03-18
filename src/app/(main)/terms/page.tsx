export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h1 className="text-4xl font-bold text-white mb-8">Terms of Service</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-[#a1a1a1]">
          <p className="text-sm">Last updated: February 2026</p>

          <h2 className="text-xl font-semibold text-white mt-8">1. Acceptance of Terms</h2>
          <p>By accessing or using GREENROOM, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the platform.</p>

          <h2 className="text-xl font-semibold text-white mt-8">2. Account Registration</h2>
          <p>You must create an account to use GREENROOM. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.</p>

          <h2 className="text-xl font-semibold text-white mt-8">3. Subscriptions & Credits</h2>
          <p>GREENROOM operates on a subscription-based credit system. Subscriptions are billed monthly. Credits are issued at the start of each billing cycle and roll over to subsequent months. Credits have no cash value and are non-refundable.</p>

          <h2 className="text-xl font-semibold text-white mt-8">4. Sample Licensing</h2>
          <p>All samples purchased through GREENROOM are 100% royalty-free. You may use purchased samples in commercial and non-commercial projects without additional fees or attribution. You may not resell, redistribute, or share raw sample files.</p>

          <h2 className="text-xl font-semibold text-white mt-8">5. Creator Terms</h2>
          <p>Creators retain ownership of their original works. By uploading to GREENROOM, creators grant a non-exclusive license for distribution through the platform. Payouts are calculated monthly based on credit usage and subject to a minimum threshold.</p>

          <h2 className="text-xl font-semibold text-white mt-8">6. Prohibited Use</h2>
          <p>You may not use GREENROOM to upload infringing, harmful, or illegal content. We reserve the right to remove content and terminate accounts that violate these terms.</p>

          <h2 className="text-xl font-semibold text-white mt-8">7. Limitation of Liability</h2>
          <p>GREENROOM is provided &quot;as is&quot; without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the platform.</p>

          <h2 className="text-xl font-semibold text-white mt-8">8. Changes to Terms</h2>
          <p>We may update these terms at any time. Continued use of the platform after changes constitutes acceptance of the updated terms.</p>

          <h2 className="text-xl font-semibold text-white mt-8">9. Contact</h2>
          <p>Questions about these terms? Contact us at <a href="mailto:support@greenroom.app" className="text-[#39b54a] hover:underline">support@greenroom.app</a></p>
        </div>
      </div>
    </div>
  );
}
