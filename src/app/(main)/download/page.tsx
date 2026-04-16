"use client";

import React, { useEffect, useState } from "react";
import { Download, Apple, Monitor, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

type Platform = "mac" | "windows" | "linux" | "unknown";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

const GITHUB_REPO = "bfalk1/Greenroom-v2";
const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
const CURRENT_VERSION = "1.5.0";

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export default function DownloadPage() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [assets, setAssets] = useState<ReleaseAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState<string>(CURRENT_VERSION);

  useEffect(() => {
    setPlatform(detectPlatform());
    
    // Fetch latest release from our API (handles private repo auth)
    fetch("/api/releases")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.assets) {
          setAssets(data.assets);
          setVersion(data.tag_name || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getAssetForPlatform = (p: Platform): ReleaseAsset | undefined => {
    return assets.find(a => {
      const name = a.name.toLowerCase();
      if (p === "mac") return name.endsWith(".dmg") || (name.endsWith(".zip") && name.includes("mac"));
      if (p === "windows") return name.endsWith(".exe");
      if (p === "linux") return name.endsWith(".appimage") || name.endsWith(".deb");
      return false;
    });
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const platformConfig = {
    mac: { icon: Apple, label: "macOS", extension: ".dmg" },
    windows: { icon: Monitor, label: "Windows", extension: ".exe" },
    linux: { icon: Terminal, label: "Linux", extension: ".AppImage" },
  };

  const primaryAsset = platform !== "unknown" ? getAssetForPlatform(platform) : undefined;
  const primaryConfig = platform !== "unknown" ? platformConfig[platform] : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#39b54a] to-[#2e9140] flex items-center justify-center mx-auto mb-6">
            <Download className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Download GREENROOM
          </h1>
          <p className="text-xl text-[#a1a1a1]">
            Get the desktop app for the best experience
          </p>
          {version && (
            <p className="text-sm text-[#666] mt-2">Version {version}</p>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-[#39b54a] border-t-transparent rounded-full mx-auto" />
          </div>
        ) : assets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#a1a1a1] mb-4">No releases available yet.</p>
            <p className="text-sm text-[#666]">
              The desktop app is coming soon. Check back later!
            </p>
          </div>
        ) : (
          <>
            {/* Primary Download */}
            {primaryAsset && primaryConfig && (
              <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-8 mb-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#2a2a2a] flex items-center justify-center">
                      <primaryConfig.icon className="w-6 h-6 text-[#39b54a]" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white">
                        GREENROOM for {primaryConfig.label}
                      </h2>
                      <p className="text-sm text-[#666]">
                        {primaryAsset.name} • {formatSize(primaryAsset.size)}
                      </p>
                    </div>
                  </div>
                  <a href={primaryAsset.browser_download_url}>
                    <Button className="bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold px-6">
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </a>
                </div>
              </div>
            )}

            {/* Other Platforms */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["mac", "windows", "linux"] as const).map((p) => {
                if (p === platform) return null;
                const asset = getAssetForPlatform(p);
                const config = platformConfig[p];
                if (!asset) return null;
                
                return (
                  <a
                    key={p}
                    href={asset.browser_download_url}
                    className="bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] p-6 hover:border-[#39b54a]/30 transition group"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <config.icon className="w-5 h-5 text-[#666] group-hover:text-[#39b54a] transition" />
                      <span className="font-medium text-white">{config.label}</span>
                    </div>
                    <p className="text-xs text-[#666]">{formatSize(asset.size)}</p>
                  </a>
                );
              })}
            </div>

            {/* All Downloads Link */}
            <div className="text-center mt-8">
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#39b54a] hover:text-white transition"
              >
                View all releases on GitHub →
              </a>
            </div>
          </>
        )}

        {/* Features */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-10 h-10 rounded-lg bg-[#39b54a]/10 flex items-center justify-center mx-auto mb-3">
              <Download className="w-5 h-5 text-[#39b54a]" />
            </div>
            <h3 className="font-medium text-white mb-1">Faster Downloads</h3>
            <p className="text-sm text-[#666]">Download samples directly to your DAW folder</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 rounded-lg bg-[#39b54a]/10 flex items-center justify-center mx-auto mb-3">
              <Monitor className="w-5 h-5 text-[#39b54a]" />
            </div>
            <h3 className="font-medium text-white mb-1">Native Experience</h3>
            <p className="text-sm text-[#666]">Full desktop app with system integration</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 rounded-lg bg-[#39b54a]/10 flex items-center justify-center mx-auto mb-3">
              <Apple className="w-5 h-5 text-[#39b54a]" />
            </div>
            <h3 className="font-medium text-white mb-1">Cross Platform</h3>
            <p className="text-sm text-[#666]">Available for macOS, Windows, and Linux</p>
          </div>
        </div>
      </div>
    </div>
  );
}
