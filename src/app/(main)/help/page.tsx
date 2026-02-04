import { Zap, CreditCard, Download, Music, User, Shield } from "lucide-react";
import Link from "next/link";

const topics = [
  {
    icon: Zap,
    title: "Credits & Subscriptions",
    items: [
      { q: "How do credits work?", a: "Each sample has a credit price. When you purchase a sample, credits are deducted from your balance. You can then download that sample unlimited times." },
      { q: "Do unused credits expire?", a: "No — unused credits roll over to the next billing cycle indefinitely as long as your subscription is active." },
      { q: "What happens if I cancel?", a: "Your credits remain available until the end of your current billing period. After that, you keep access to previously purchased samples but can't make new purchases." },
    ],
  },
  {
    icon: CreditCard,
    title: "Billing & Payments",
    items: [
      { q: "How do I manage my subscription?", a: "Go to your Account page and click 'Manage Subscription' to open the Stripe billing portal where you can change plans, update payment methods, or cancel." },
      { q: "Can I upgrade or downgrade?", a: "Yes — upgrading mid-cycle gives you bonus credits for the difference. Downgrading takes effect at the next billing cycle." },
      { q: "What payment methods are accepted?", a: "We accept all major credit and debit cards through Stripe." },
    ],
  },
  {
    icon: Download,
    title: "Downloads & Library",
    items: [
      { q: "How do I download a sample?", a: "After purchasing a sample with credits, go to your Library page and click the download button. Downloads are unlimited for purchased samples." },
      { q: "What format are samples in?", a: "All samples are high-quality WAV files." },
      { q: "Can I re-download samples?", a: "Yes — once purchased, you can download a sample as many times as you need from your Library." },
    ],
  },
  {
    icon: Music,
    title: "Licensing",
    items: [
      { q: "Are samples royalty-free?", a: "Yes — all samples on GREENROOM are 100% royalty-free. Use them in any commercial or personal project." },
      { q: "Do I need to credit the creator?", a: "No attribution is required, though creators always appreciate a shoutout." },
      { q: "Can I share samples with others?", a: "No — samples are licensed for your use only. Others need their own GREENROOM subscription." },
    ],
  },
  {
    icon: User,
    title: "Becoming a Creator",
    items: [
      { q: "How do I become a creator?", a: "Apply through the 'Become a Creator' page. You'll need to submit your artist info and a portfolio of sample work for review." },
      { q: "How do payouts work?", a: "Creators earn revenue based on credit usage. Payouts are calculated monthly and sent via Stripe Connect once the minimum threshold is met." },
    ],
  },
  {
    icon: Shield,
    title: "Account & Security",
    items: [
      { q: "How do I change my password?", a: "You can reset your password from the login page using the 'Forgot Password' link." },
      { q: "How do I delete my account?", a: "Contact us at support@greenroom.app and we'll process your account deletion request." },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-white mb-4">Help Center</h1>
          <p className="text-[#a1a1a1]">
            Find answers to common questions about GREENROOM
          </p>
        </div>

        <div className="space-y-12">
          {topics.map((topic) => (
            <div key={topic.title}>
              <div className="flex items-center gap-3 mb-6">
                <topic.icon className="w-6 h-6 text-[#00FF88]" />
                <h2 className="text-2xl font-bold text-white">{topic.title}</h2>
              </div>
              <div className="space-y-4">
                {topic.items.map((item) => (
                  <div
                    key={item.q}
                    className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6"
                  >
                    <h3 className="text-white font-semibold mb-2">{item.q}</h3>
                    <p className="text-[#a1a1a1] text-sm">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-8">
          <h3 className="text-xl font-bold text-white mb-2">Still need help?</h3>
          <p className="text-[#a1a1a1] mb-4">
            Can&apos;t find what you&apos;re looking for? Reach out to our team.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-[#00FF88] text-black hover:bg-[#00cc6a] font-semibold px-6 py-3 rounded-lg transition"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}
