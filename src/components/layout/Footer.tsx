import { Music } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-[#2a2a2a] bg-[#0a0a0a] mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Music className="w-5 h-5 text-[#00FF88]" />
              <span className="font-bold text-white">GREENROOM</span>
            </div>
            <p className="text-[#a1a1a1] text-sm">
              Music samples for creators
            </p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Platform</h3>
            <ul className="space-y-2 text-sm text-[#a1a1a1]">
              <li>
                <a href="/marketplace" className="hover:text-white transition">
                  Browse Samples
                </a>
              </li>
              <li>
                <a href="/pricing" className="hover:text-white transition">
                  Pricing
                </a>
              </li>
              <li>
                <a
                  href="/creator/apply"
                  className="hover:text-white transition"
                >
                  For Creators
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Resources</h3>
            <ul className="space-y-2 text-sm text-[#a1a1a1]">
              <li>
                <a href="#" className="hover:text-white transition">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Blog
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Legal</h3>
            <ul className="space-y-2 text-sm text-[#a1a1a1]">
              <li>
                <a href="#" className="hover:text-white transition">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[#2a2a2a] pt-8">
          <p className="text-center text-[#a1a1a1] text-sm">
            © 2024 GREENROOM. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
