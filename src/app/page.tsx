import Link from "next/link";
import { Play, Music, Zap, Users } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      {/* Navigation */}
      <header className="border-b border-[#2a2a2a] bg-[#0a0a0a]/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697bed99d794c79d63ec6b73/c33d47e0e_GREENROOMLOGOWHITE.png"
                alt="GREENROOM"
                className="h-4"
              />
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/explore"
                className="text-sm font-medium text-[#a1a1a1] hover:text-white transition"
              >
                Explore
              </Link>
              <Link
                href="/pricing"
                className="text-sm font-medium text-[#a1a1a1] hover:text-white transition"
              >
                Pricing
              </Link>
              <Link
                href="/login"
                className="text-sm font-medium text-[#a1a1a1] hover:text-white transition"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="bg-[#39b54a] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#2e9140] transition"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
          Royalty-Free Samples
          <br />
          <span className="text-[#39b54a]">From Top Creators</span>
        </h1>
        <p className="text-xl text-[#a1a1a1] max-w-2xl mx-auto mb-10">
          Discover thousands of high-quality samples. Preview for free, subscribe to download.
          100% royalty-free for your productions.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 bg-[#39b54a] text-black px-8 py-4 rounded-xl text-lg font-semibold hover:bg-[#2e9140] transition"
          >
            <Play className="w-5 h-5" />
            Start Exploring
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-[#2a2a2a] transition"
          >
            View Plans
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-8">
            <div className="w-12 h-12 bg-[#39b54a]/20 rounded-lg flex items-center justify-center mb-6">
              <Music className="w-6 h-6 text-[#39b54a]" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Thousands of Samples</h3>
            <p className="text-[#a1a1a1]">
              Browse loops, one-shots, and full packs across every genre. New uploads daily.
            </p>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-8">
            <div className="w-12 h-12 bg-[#39b54a]/20 rounded-lg flex items-center justify-center mb-6">
              <Users className="w-6 h-6 text-[#39b54a]" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Top Creators</h3>
            <p className="text-[#a1a1a1]">
              Samples from professional producers and sound designers. Follow your favorites.
            </p>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-8">
            <div className="w-12 h-12 bg-[#39b54a]/20 rounded-lg flex items-center justify-center mb-6">
              <Zap className="w-6 h-6 text-[#39b54a]" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">100% Royalty-Free</h3>
            <p className="text-[#a1a1a1]">
              Use in any project, commercial or personal. No extra licensing fees.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-gradient-to-r from-[#39b54a]/20 to-[#1a1a1a] border border-[#39b54a]/30 rounded-2xl p-12 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to create?</h2>
          <p className="text-[#a1a1a1] mb-8 max-w-xl mx-auto">
            Start exploring samples for free. Subscribe when you&apos;re ready to download.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-[#39b54a] text-black px-8 py-4 rounded-xl text-lg font-semibold hover:bg-[#2e9140] transition"
          >
            Create Free Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#2a2a2a] bg-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697bed99d794c79d63ec6b73/c33d47e0e_GREENROOMLOGOWHITE.png"
              alt="GREENROOM"
              className="h-4"
            />
            <div className="flex items-center gap-6 text-sm text-[#666]">
              <Link href="/terms" className="hover:text-white transition">Terms</Link>
              <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
              <Link href="/help" className="hover:text-white transition">Help</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
