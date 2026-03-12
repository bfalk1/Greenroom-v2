"use client";

import { Button } from "@/components/ui/button";
import { Apple, Monitor, Download, ExternalLink } from "lucide-react";
import Link from "next/link";

const GITHUB_RELEASES_URL = "https://github.com/bfalk1/Greenroom-v2/releases/latest";

export default function DownloadPage() {
  const platforms = [
    {
      name: "macOS",
      icon: Apple,
      description: "For Mac computers",
      requirements: "macOS 10.13 or later",
      fileHint: ".dmg",
    },
    {
      name: "Windows",
      icon: Monitor,
      description: "For Windows PCs",
      requirements: "Windows 10 or later",
      fileHint: ".exe",
    },
    {
      name: "Linux",
      icon: Monitor,
      description: "For Linux systems",
      requirements: "Ubuntu 18.04+ or equivalent",
      fileHint: ".AppImage",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141414] to-[#0a0a0a] py-20 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00FF88] to-[#00cc6a] mb-6">
            <Download className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Download GREENROOM
          </h1>
          <p className="text-xl text-[#a1a1a1] max-w-2xl mx-auto">
            Get the desktop app for the best experience. Browse, preview, and download samples right from your desktop.
          </p>
        </div>

        {/* Platform Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {platforms.map((platform) => (
            <div
              key={platform.name}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 flex flex-col items-center text-center hover:border-[#00FF88]/30 transition-colors"
            >
              <div className="w-14 h-14 rounded-xl bg-[#0a0a0a] flex items-center justify-center mb-4">
                <platform.icon className="w-7 h-7 text-[#00FF88]" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                {platform.name}
              </h2>
              <p className="text-[#a1a1a1] text-sm mb-1">
                {platform.description}
              </p>
              <p className="text-[#666] text-xs mb-2">
                {platform.requirements}
              </p>
              <p className="text-[#00FF88] text-xs">
                {platform.fileHint}
              </p>
            </div>
          ))}
        </div>

        {/* Download Button */}
        <div className="text-center mb-16">
          <Button
            asChild
            size="lg"
            className="bg-[#00FF88] text-black hover:bg-[#00cc6a] font-semibold text-lg px-8 py-6"
          >
            <a href={GITHUB_RELEASES_URL} target="_blank" rel="noopener noreferrer">
              <Download className="w-5 h-5 mr-2" />
              Download Latest Release
              <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </Button>
          <p className="text-[#666] text-sm mt-4">
            Choose your platform on the releases page
          </p>
        </div>

        {/* Web App Alternative */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 text-center">
          <h3 className="text-lg font-semibold text-white mb-2">
            Prefer the web?
          </h3>
          <p className="text-[#a1a1a1] mb-4">
            You can also use GREENROOM directly in your browser — no download required.
          </p>
          <Button
            asChild
            variant="outline"
            className="border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
          >
            <Link href="/marketplace">
              Open Web App
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
