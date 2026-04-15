import Link from "next/link";

export default function CreatorTermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h1 className="text-4xl font-bold text-white mb-8">Creator Terms of Use</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-[#a1a1a1]">
          <p className="text-sm">Effective Date: April 2026</p>

          <h2 className="text-xl font-semibold text-white mt-8">1. Overview</h2>
          <p>
            These Creator Terms of Use (the &quot;Terms&quot;) govern your participation as a content creator (&quot;Creator&quot;) on the
            Greenroom platform (&quot;Greenroom&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By uploading, publishing, or otherwise submitting
            audio samples, loops, one-shots, presets, or other content (collectively, &quot;Content&quot;), you agree to be bound by
            these Terms.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">2. Ownership and License</h2>
          <p>
            <strong className="text-white">2.1 Creator Ownership.</strong> Subject to the rights granted in these Terms, Creators retain ownership of their
            original Content uploaded to Greenroom.
          </p>
          <p>
            <strong className="text-white">2.2 License to Greenroom.</strong> You grant Greenroom a worldwide, non-exclusive, royalty-free license to host,
            reproduce, store, display, distribute, market, and otherwise use your Content as reasonably necessary to
            operate, promote, and improve the platform.
          </p>
          <p>
            <strong className="text-white">2.3 License to End Users.</strong> You authorize Greenroom to grant end users a royalty-free, perpetual, worldwide,
            non-exclusive license to use downloaded Content for personal and commercial purposes in accordance with
            Greenroom&apos;s{" "}
            <Link href="/license" className="text-[#39b54a] hover:underline">Sample License Agreement</Link>.
          </p>
          <p>
            <strong className="text-white">2.4 Non-Exclusivity.</strong> Content uploaded to Greenroom may also be sold or distributed elsewhere, provided that
            such Content is not subject to any exclusive arrangement that would prevent its lawful distribution through
            Greenroom.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">3. Creator Representations and Warranties</h2>
          <p>You represent and warrant that:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>you own or control all rights necessary to upload and license your Content;</li>
            <li>all Content is 100% original work and does not include ripped audio, uncleared samples, copied melodies, copied recordings, or any other unauthorized third-party material;</li>
            <li>your Content does not violate any copyright, trademark, publicity, privacy, contract, or other rights of any third party; and</li>
            <li>the information you provide to Greenroom is accurate and complete.</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">4. Prohibited Content and Conduct</h2>
          <p>You may not upload Content that:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>uses AI-generated celebrity voices, impersonations, or unauthorized voice likenesses;</li>
            <li>contains recognizable copyrighted material or any other material you do not have the legal right to distribute;</li>
            <li>is low-quality, misleading, spammy, fraudulent, or otherwise inconsistent with Greenroom&apos;s quality standards; or</li>
            <li>is submitted for any abusive, deceptive, or unlawful purpose.</li>
          </ul>
          <p>
            Greenroom may allow lawful adult or explicit lyrical subject matter, but Content must still comply with all
            applicable law, these Terms, and Greenroom&apos;s quality and rights-clearance requirements.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">5. Platform Rights</h2>
          <p>
            <strong className="text-white">5.1 Marketing Use.</strong> You grant Greenroom the right to use your artist name, brand assets, biography, and
            Content excerpts for marketing, promotion, social media, advertising, editorial features, and other
            platform-related communications.
          </p>
          <p>
            <strong className="text-white">5.2 Technical Modifications.</strong> Greenroom may normalize audio, trim files, convert formats, generate previews,
            create waveform images, and make similar technical modifications required for platform functionality, content
            review, and user experience.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">6. Payouts</h2>
          <p>
            <strong className="text-white">6.1 Rate.</strong> Creators are currently paid USD $0.03 per credit redeemed by users for the Creator&apos;s Content.
          </p>
          <p>
            <strong className="text-white">6.2 Schedule.</strong> Subject to these Terms, payouts are processed at the end of each calendar month if the
            applicable payout threshold has been met.
          </p>
          <p>
            <strong className="text-white">6.3 Threshold.</strong> Greenroom may set and update a minimum payout threshold, which is currently anticipated to
            be USD $50.
          </p>
          <p>
            <strong className="text-white">6.4 Holds and Investigations.</strong> Greenroom may delay, withhold, offset, or reverse payouts where sample
            authenticity, rights ownership, fraud, abusive activity, refund exposure, or other compliance concerns are
            reasonably in question.
          </p>
          <p>
            <strong className="text-white">6.5 Changes.</strong> Greenroom may modify payout rates, thresholds, methods, and related commercial terms at any
            time in its discretion.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">7. Taxes</h2>
          <p>
            You are solely responsible for all taxes, duties, reporting obligations, and other governmental assessments
            arising from your activity on Greenroom. Greenroom may require tax forms, identity verification, or other payout
            documentation before releasing funds.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">8. Suspension, Removal, and Termination</h2>
          <p>
            <strong className="text-white">8.1 Platform Discretion.</strong> Greenroom may review, reject, remove, suspend, restrict, or terminate any Content
            or Creator account at any time, with or without notice, in its discretion.
          </p>
          <p>
            <strong className="text-white">8.2 Effect of Termination.</strong> If your account is suspended or terminated, your Content may be removed from the
            platform and your access to creator tools, analytics, and unpaid or pending earnings may be restricted to the
            extent permitted by law and these Terms.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">9. Indemnification</h2>
          <p>
            You agree to defend, indemnify, and hold harmless Greenroom and its affiliates, officers, directors, employees,
            contractors, successors, and assigns from and against any claims, losses, liabilities, damages, judgments,
            settlements, penalties, costs, and expenses (including reasonable legal fees) arising out of or related to your
            Content, your breach of these Terms, or your violation of any law or third-party right.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">10. Fraud, Abuse, and Clawbacks</h2>
          <p>
            Greenroom may investigate suspicious activity and may withhold, offset, reverse, or recover earnings where
            downloads, credit usage, referrals, or platform activity appear fraudulent, manipulated, artificial, collusive, or
            otherwise abusive.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">11. Restrictions on Resale and Third-Party Content</h2>
          <p>
            You may not upload, distribute, or monetize Content on Greenroom that was downloaded from Greenroom or
            obtained from another sample marketplace, creator, pack, or library for resale, relicensing, or repackaging.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">12. Quality Standards</h2>
          <p>
            Greenroom may establish and enforce editorial, technical, and quality standards for all uploaded Content,
            including standards relating to originality, file quality, metadata accuracy, and commercial suitability.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">13. Changes to These Terms</h2>
          <p>
            Greenroom may update these Terms at any time. Your continued use of the platform after updated Terms
            become effective constitutes acceptance of the revised Terms.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">14. Governing Law</h2>
          <p>
            These Terms are governed by the laws of British Columbia and the federal laws of Canada applicable therein,
            without regard to conflict of laws principles.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">15. Entire Agreement</h2>
          <p>
            These Terms, together with any incorporated policies and agreements, constitute the entire agreement
            between you and Greenroom concerning your participation as a Creator on the platform.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">16. Contact</h2>
          <p>
            Questions about these terms? Contact us at{" "}
            <a href="mailto:support@greenroom.fm" className="text-[#39b54a] hover:underline">support@greenroom.fm</a>
          </p>
        </div>
      </div>
    </div>
  );
}
