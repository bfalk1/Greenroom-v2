export default function CopyrightPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h1 className="text-4xl font-bold text-white mb-8">Copyright and Takedown Policy</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-[#a1a1a1]">
          <p className="text-sm">Effective Date: April 2026</p>

          <h2 className="text-xl font-semibold text-white mt-8">1. Overview</h2>
          <p>
            Greenroom respects intellectual property rights and expects all creators and users to do the same. This
            Copyright and Takedown Policy describes how rights complaints may be submitted and how Greenroom may
            respond.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">2. Submitting a Rights Complaint</h2>
          <p>
            If you believe content on Greenroom infringes your copyright or other enforceable intellectual property right,
            please submit a written notice including:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>your full name and contact information;</li>
            <li>identification of the copyrighted work or other protected material claimed to be infringed;</li>
            <li>identification of the allegedly infringing content, including sufficient information for Greenroom to locate it;</li>
            <li>a statement that you have a good-faith belief the disputed use is not authorized by the rights holder, its agent, or the law;</li>
            <li>a statement that the information in the notice is accurate and, where applicable, that you are the rights holder or authorized to act on the rights holder&apos;s behalf; and</li>
            <li>your physical or electronic signature.</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">3. Greenroom Response</h2>
          <p>
            Upon receipt of a facially valid complaint, Greenroom may remove or disable access to the challenged content,
            notify the affected creator or user, request additional information, and take any other action we consider
            appropriate to investigate and mitigate risk.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">4. Counter-Notice</h2>
          <p>
            If you believe content was removed or disabled in error, you may submit a counter-notice containing sufficient
            information for Greenroom to evaluate the dispute, including your contact details, identification of the removed
            content, the basis for your objection, and your physical or electronic signature.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">5. Repeat Infringers</h2>
          <p>
            Greenroom may suspend or terminate accounts of repeat infringers or of users who repeatedly submit content
            that creates legal risk, even if each claim is ultimately disputed.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">6. Misrepresentations</h2>
          <p>
            Submitting knowingly false, misleading, or abusive rights complaints or counter-notices may result in account
            action and may expose the submitting party to legal liability.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">7. Contact</h2>
          <p>
            Rights complaints and counter-notices should be sent to{" "}
            <a href="mailto:legal@greenroom.fm" className="text-[#39b54a] hover:underline">legal@greenroom.fm</a>.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8">8. Reservation of Rights</h2>
          <p>
            Greenroom may remove content or restrict accounts at any time if we believe doing so is necessary to protect
            rights holders, the platform, or our users.
          </p>
        </div>
      </div>
    </div>
  );
}
