import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h1 className="text-4xl font-bold text-white mb-8">User Terms of Use</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-[#a1a1a1]">
          <p className="text-sm">Effective Date: April 2026</p>

          <h2 className="text-xl font-semibold text-white mt-8">1. Overview</h2>
          <p>
            These User Terms of Use (the &quot;Terms&quot;) govern your access to and use of the Greenroom platform
            (&quot;Greenroom&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By creating an account, browsing content, purchasing a subscription,
            redeeming credits, or downloading content, you agree to these Terms.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">2. Eligibility and Accounts</h2>
          <p>
            You must provide accurate information, maintain the security of your account credentials, and remain
            responsible for activity occurring under your account. You may not share, sell, or transfer your account except
            with Greenroom&apos;s prior written consent.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">3. Subscription and Credits</h2>
          <p>
            <strong className="text-white">3.1 Subscription Model.</strong> Greenroom operates on a subscription-based credit system. Users receive credits
            under the terms of their selected plan and may use those credits to download available content.
          </p>
          <p>
            <strong className="text-white">3.2 Credit Rules.</strong> Credits may roll over only to the extent permitted by the applicable plan terms. Credits have
            no cash value, are non-refundable except where required by law, and may not be sold, transferred, or
            exchanged outside the platform.
          </p>
          <p>
            <strong className="text-white">3.3 Billing.</strong> Subscription fees are billed in advance and renew automatically until cancelled. Upgrades may
            take effect immediately and may reset the billing cycle. Downgrades generally take effect at the next renewal
            date. Cancellation stops future billing but does not revoke rights already granted for content lawfully
            downloaded before cancellation.
          </p>
          <p>
            <strong className="text-white">3.4 Payment Processing.</strong> Payments may be processed by third-party providers. You authorize Greenroom
            and its payment processors to charge the payment method you provide for applicable fees, taxes, and
            renewals.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">4. Content License</h2>
          <p>
            When you lawfully download content through Greenroom, you receive the rights described in the Greenroom{" "}
            <Link href="/license" className="text-[#39b54a] hover:underline">Sample License Agreement</Link>.
            Except for those licensed rights, no ownership in any content is transferred to you.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">5. Restrictions</h2>
          <p>You may not:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>redistribute, resell, sublicense, share, upload, or publish downloaded content as standalone files;</li>
            <li>package downloaded content into sample packs, stems, sound libraries, presets, or competing services;</li>
            <li>use bots, scripts, account sharing, or any other method to abuse the credit system or manipulate platform activity;</li>
            <li>misrepresent your identity, purchase activity, or rights in downloaded content; or</li>
            <li>use the platform in any unlawful or infringing manner.</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">6. Intellectual Property</h2>
          <p>
            Greenroom, its branding, software, design, and platform materials are owned by Greenroom or its licensors
            and are protected by applicable intellectual property laws. All uploaded content remains owned by its
            respective creators, subject to the licenses granted through the platform.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">7. Suspension and Termination</h2>
          <p>
            Greenroom may suspend, restrict, or terminate your account, your subscription, or your access to the platform
            at any time if we reasonably believe you have violated these Terms, engaged in fraud or abuse, or created
            legal, operational, or reputational risk.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">8. Disclaimers</h2>
          <p>
            The platform and all content are provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the maximum extent
            permitted by law, Greenroom disclaims warranties of merchantability, fitness for a particular purpose, title,
            non-infringement, uninterrupted access, and error-free operation.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">9. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Greenroom will not be liable for any indirect, incidental, special,
            consequential, exemplary, or punitive damages, or any loss of profits, revenue, data, goodwill, or business
            opportunity arising out of or related to the platform, the content, or these Terms. Greenroom&apos;s aggregate
            liability for any claim arising out of or relating to the platform will not exceed the amount you paid to Greenroom
            in the twelve months preceding the event giving rise to the claim.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">10. Changes to These Terms</h2>
          <p>
            Greenroom may update these Terms at any time. Continued use of the platform after updated Terms become
            effective constitutes acceptance of the revised Terms.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">11. Governing Law</h2>
          <p>
            These Terms are governed by the laws of British Columbia and the federal laws of Canada applicable therein,
            without regard to conflict of laws principles.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">12. Contact</h2>
          <p>
            Questions about these terms? Contact us at{" "}
            <a href="mailto:support@greenroom.fm" className="text-[#39b54a] hover:underline">support@greenroom.fm</a>
          </p>
        </div>
      </div>
    </div>
  );
}
