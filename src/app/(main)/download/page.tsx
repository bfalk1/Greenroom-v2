"use client";

import React, { useEffect, useState } from "react";
import { Download, Command, Monitor, Terminal, Check, Zap, FolderSync, Sparkles } from "lucide-react";
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
const CURRENT_VERSION = "1.7.0";
const RELEASE_BASE = `https://github.com/${GITHUB_REPO}/releases/download/v${CURRENT_VERSION}`;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

// Fallback asset list so the page always shows working download links,
// even if the GitHub API call fails (rate-limit, outage, etc.).
const FALLBACK_ASSETS: ReleaseAsset[] = [
  {
    name: `GREENROOM-${CURRENT_VERSION}-mac-arm64.dmg`,
    browser_download_url: `${RELEASE_BASE}/GREENROOM-${CURRENT_VERSION}-mac-arm64.dmg`,
    size: 106017457,
  },
  {
    name: `GREENROOM-${CURRENT_VERSION}-mac-x64.dmg`,
    browser_download_url: `${RELEASE_BASE}/GREENROOM-${CURRENT_VERSION}-mac-x64.dmg`,
    size: 110431801,
  },
  {
    name: `GREENROOM-${CURRENT_VERSION}-win-x64.exe`,
    browser_download_url: `${RELEASE_BASE}/GREENROOM-${CURRENT_VERSION}-win-x64.exe`,
    size: 85698752,
  },
  {
    name: `GREENROOM-${CURRENT_VERSION}-linux-x86_64.AppImage`,
    browser_download_url: `${RELEASE_BASE}/GREENROOM-${CURRENT_VERSION}-linux-x86_64.AppImage`,
    size: 112894393,
  },
  {
    name: `GREENROOM-${CURRENT_VERSION}-linux-amd64.deb`,
    browser_download_url: `${RELEASE_BASE}/GREENROOM-${CURRENT_VERSION}-linux-amd64.deb`,
    size: 88430340,
  },
];

export default function DownloadPage() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [assets, setAssets] = useState<ReleaseAsset[]>(FALLBACK_ASSETS);
  const [version, setVersion] = useState<string>(CURRENT_VERSION);

  useEffect(() => {
    setPlatform(detectPlatform());

    // Try to fetch the latest release from GitHub. If it succeeds we upgrade
    // the fallback list; if not, the user still has working links.
    fetch("/api/releases")
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.assets?.length) {
          setAssets(data.assets);
          if (data.tag_name) setVersion(data.tag_name);
        }
      })
      .catch(() => {});
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
    mac: { icon: Command, label: "macOS", sub: "Intel & Apple Silicon" },
    windows: { icon: Monitor, label: "Windows", sub: "10 and later" },
    linux: { icon: Terminal, label: "Linux", sub: "AppImage" },
  };

  const primaryAsset = platform !== "unknown" ? getAssetForPlatform(platform) : undefined;
  const primaryConfig = platform !== "unknown" ? platformConfig[platform] : undefined;

  const otherPlatforms = (["mac", "windows", "linux"] as const).filter(p => p !== platform);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a]">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-[#39b54a]/10 blur-[140px]" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-[#39b54a]/5 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-[#39b54a]/20 bg-[#39b54a]/5 text-xs font-medium text-[#39b54a]">
            <Sparkles className="w-3 h-3" />
            Desktop app {version && `• v${version.replace(/^v/, "")}`}
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-white mb-5 tracking-tight">
            Bring GREENROOM
            <br />
            <span className="bg-gradient-to-r from-[#39b54a] to-[#6ae076] bg-clip-text text-transparent">
              to your desktop
            </span>
          </h1>
          <p className="text-lg text-[#a1a1a1] max-w-xl mx-auto">
            Native performance, offline playback, and direct sync with your DAW — free for all members.
          </p>
        </div>

        {/* Primary Download Card */}
            {primaryAsset && primaryConfig ? (
              <div className="relative mb-10">
                {/* Glow */}
                <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-r from-[#39b54a]/40 via-[#39b54a]/10 to-[#39b54a]/40 blur-2xl opacity-40" />
                <div className="relative rounded-3xl bg-gradient-to-b from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#39b54a]/50 to-transparent" />

                  <div className="p-8 sm:p-10 flex flex-col md:flex-row md:items-center gap-8">
                    <div className="flex items-center gap-5 flex-1 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#39b54a]">
                            <Check className="w-3 h-3" />
                            Detected
                          </span>
                        </div>
                        <h2 className="text-2xl font-bold text-white truncate">
                          GREENROOM for {primaryConfig.label}
                        </h2>
                        <p className="text-sm text-[#888] mt-1">
                          {primaryConfig.sub} • {formatSize(primaryAsset.size)}
                        </p>
                      </div>
                    </div>

                    <a href={primaryAsset.browser_download_url} className="flex-shrink-0">
                      <Button
                        size="lg"
                        className="group bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold px-8 h-14 rounded-xl shadow-lg shadow-[#39b54a]/20 transition-all hover:shadow-[#39b54a]/40 hover:scale-[1.02]"
                      >
                        <Download className="w-5 h-5 mr-2 transition-transform group-hover:translate-y-0.5" />
                        Download
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              // Unknown platform: show all three as primary choices
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                {(["mac", "windows", "linux"] as const).map((p) => {
                  const asset = getAssetForPlatform(p);
                  const config = platformConfig[p];
                  if (!asset) return null;
                  return (
                    <a
                      key={p}
                      href={asset.browser_download_url}
                      className="group relative rounded-2xl bg-[#141414] border border-[#2a2a2a] p-6 hover:border-[#39b54a]/40 transition overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-[#39b54a]/0 to-[#39b54a]/0 group-hover:from-[#39b54a]/5 group-hover:to-transparent transition" />
                      <div className="relative">
                        <config.icon className="w-8 h-8 text-[#39b54a] mb-4" />
                        <h3 className="text-lg font-semibold text-white mb-1">{config.label}</h3>
                        <p className="text-xs text-[#666] mb-4">{config.sub}</p>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[#888]">{formatSize(asset.size)}</span>
                          <span className="text-[#39b54a] font-medium group-hover:translate-x-0.5 transition-transform">
                            Download →
                          </span>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}

            {/* Other Platforms (compact) */}
            {primaryAsset && otherPlatforms.some(p => getAssetForPlatform(p)) && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
                <span className="text-sm text-[#666]">Also available for</span>
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {otherPlatforms.map((p) => {
                    const asset = getAssetForPlatform(p);
                    const config = platformConfig[p];
                    if (!asset) return null;
                    return (
                      <a
                        key={p}
                        href={asset.browser_download_url}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#141414] border border-[#2a2a2a] hover:border-[#39b54a]/40 hover:bg-[#1a1a1a] text-sm text-white transition"
                      >
                        <config.icon className="w-4 h-4 text-[#a1a1a1]" />
                        {config.label}
                        <span className="text-xs text-[#666]">{formatSize(asset.size)}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* GitHub Releases Link */}
            <div className="text-center mb-20">
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-[#666] hover:text-[#39b54a] transition"
              >
                View release notes and older versions
                <span aria-hidden>→</span>
              </a>
            </div>

        {/* Features */}
        <div className="relative rounded-3xl bg-gradient-to-b from-[#141414] to-[#0f0f0f] border border-[#2a2a2a] p-8 sm:p-10">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-semibold text-white mb-2">
              Built for producers
            </h2>
            <p className="text-sm text-[#a1a1a1]">
              Why the desktop app beats the browser
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="group">
              <div className="w-11 h-11 rounded-xl bg-[#39b54a]/10 border border-[#39b54a]/20 flex items-center justify-center mb-4 group-hover:bg-[#39b54a]/20 transition">
                <Zap className="w-5 h-5 text-[#39b54a]" />
              </div>
              <h3 className="font-semibold text-white mb-1.5">Instant Playback</h3>
              <p className="text-sm text-[#888] leading-relaxed">
                Native audio engine with zero-latency previews, even offline.
              </p>
            </div>
            <div className="group">
              <div className="w-11 h-11 rounded-xl bg-[#39b54a]/10 border border-[#39b54a]/20 flex items-center justify-center mb-4 group-hover:bg-[#39b54a]/20 transition">
                <FolderSync className="w-5 h-5 text-[#39b54a]" />
              </div>
              <h3 className="font-semibold text-white mb-1.5">DAW Sync</h3>
              <p className="text-sm text-[#888] leading-relaxed">
                Purchases drop straight into your sample folder — ready in your DAW.
              </p>
            </div>
            <div className="group">
              <div className="w-11 h-11 rounded-xl bg-[#39b54a]/10 border border-[#39b54a]/20 flex items-center justify-center mb-4 group-hover:bg-[#39b54a]/20 transition">
                <Monitor className="w-5 h-5 text-[#39b54a]" />
              </div>
              <h3 className="font-semibold text-white mb-1.5">Always Available</h3>
              <p className="text-sm text-[#888] leading-relaxed">
                Global shortcuts, menu-bar controls, and a home in your dock.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
