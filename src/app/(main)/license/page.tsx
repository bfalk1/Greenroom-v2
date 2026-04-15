export default function LicensePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h1 className="text-4xl font-bold text-white mb-8">Sample License Agreement</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-[#a1a1a1]">
          <p className="text-sm">Effective Date: April 2026</p>

          <h2 className="text-xl font-semibold text-white mt-8">1. Grant of License</h2>
          <p>
            Subject to compliance with applicable Greenroom terms and payment of any required subscription or credit
            charges, Greenroom grants you a royalty-free, perpetual, worldwide, non-exclusive, non-transferable license to
            use content you lawfully download from the platform.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">2. Permitted Uses</h2>
          <p>
            You may use downloaded content in personal and commercial projects, including musical compositions, sound
            recordings, performances, audiovisual works, podcasts, advertising, games, social media content, film,
            television, and other media. You may edit, process, chop, pitch, layer, transform, and otherwise incorporate the
            content into larger original works.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">3. Restrictions</h2>
          <p>You may not:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>resell, sublicense, redistribute, share, or make the content available as isolated files or in any form that permits a third party to extract the original samples;</li>
            <li>include the content in a competing sample pack, stock library, sound kit, preset bank, training dataset, or similar product;</li>
            <li>claim ownership in the original content itself; or</li>
            <li>use the content in violation of applicable law or any Greenroom policy.</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">4. Ownership</h2>
          <p>
            All right, title, and interest in and to the original content remains with the applicable creator or rights holder. This
            license grants usage rights only and does not transfer ownership.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">5. No Additional Royalties</h2>
          <p>
            No additional royalties, mechanicals, backend participation, or other usage-based fees are owed to Greenroom
            or the creator solely as a result of uses authorized under this license.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">6. Term and Termination</h2>
          <p>
            This license is perpetual for content lawfully downloaded before termination, unless revoked because you
            materially breached the applicable Greenroom terms or this Sample License Agreement. Upon breach, your
            license may terminate immediately with respect to affected content.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">7. Disclaimer</h2>
          <p>
            Downloaded content is provided &quot;as is&quot; without warranties of any kind. Greenroom does not guarantee that any
            content is free from third-party claims, though Greenroom may investigate and respond to rights complaints
            under its applicable policies.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Greenroom will not be liable for any indirect, incidental, special,
            consequential, or punitive damages arising from or related to downloaded content or your use of that content.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">9. Governing Law</h2>
          <p>
            This Sample License Agreement is governed by the laws of British Columbia and the federal laws of Canada
            applicable therein.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">10. Contact</h2>
          <p>
            Questions about this license? Contact us at{" "}
            <a href="mailto:support@greenroom.fm" className="text-[#39b54a] hover:underline">support@greenroom.fm</a>
          </p>
        </div>
      </div>
    </div>
  );
}
