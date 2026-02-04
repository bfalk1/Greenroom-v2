import Link from "next/link";
import { Music, Zap, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      {/* Simple Nav for Landing */}
      <header className="border-b border-[#2a2a2a] bg-[#0a0a0a] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697bed99d794c79d63ec6b73/c33d47e0e_GREENROOMLOGOWHITE.png"
                alt="GREENROOM"
                className="h-4"
              />
            </Link>
            <Link href="/login">
              <Button className="bg-[#00FF88] text-black hover:bg-[#00cc6a] font-medium">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Landing Hero */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00FF88] to-[#00cc6a] flex items-center justify-center">
              <Music className="w-10 h-10 text-black" />
            </div>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Premium Music Samples
            <br />
            <span className="text-[#00FF88]">for Your Sound</span>
          </h1>
          <p className="text-xl text-[#a1a1a1] mb-8 max-w-2xl mx-auto">
            Discover thousands of high-quality audio samples created by
            world-class producers. Subscribe to download unlimited.
          </p>
          <Link href="/signup">
            <Button className="bg-[#00FF88] text-black hover:bg-[#00cc6a] px-8 py-3 font-semibold text-lg">
              Get Started
            </Button>
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <div className="p-8 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="w-12 h-12 rounded-lg bg-[#00FF88]/20 flex items-center justify-center mb-4">
              <Music className="w-6 h-6 text-[#00FF88]" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              10,000+ Samples
            </h3>
            <p className="text-[#a1a1a1]">
              Constantly growing library of professional-grade music samples
              across all genres.
            </p>
          </div>
          <div className="p-8 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="w-12 h-12 rounded-lg bg-[#00FF88]/20 flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-[#00FF88]" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Credit System
            </h3>
            <p className="text-[#a1a1a1]">
              Simple credit-based pricing. Purchase once, download unlimited
              times.
            </p>
          </div>
          <div className="p-8 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="w-12 h-12 rounded-lg bg-[#00FF88]/20 flex items-center justify-center mb-4">
              <User className="w-6 h-6 text-[#00FF88]" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Support Creators
            </h3>
            <p className="text-[#a1a1a1]">
              Every purchase directly supports the talented producers behind the
              sounds.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center p-8 rounded-2xl bg-gradient-to-r from-[#00FF88]/10 to-[#00cc6a]/10 border border-[#00FF88]/20">
          <h2 className="text-2xl font-bold text-white mb-4">
            Join thousands of producers
          </h2>
          <p className="text-[#a1a1a1] mb-6">
            Start with a free trial. No credit card required.
          </p>
          <Link href="/signup">
            <Button className="bg-[#00FF88] text-black hover:bg-[#00cc6a] px-8 py-3 font-semibold">
              Sign Up Free
            </Button>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#2a2a2a] bg-[#0a0a0a] mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="border-t border-[#2a2a2a] pt-8">
            <p className="text-center text-[#a1a1a1] text-sm">
              © 2024 GREENROOM. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
