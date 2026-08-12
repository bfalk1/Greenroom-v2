"use client";

import { useState } from "react";

// Product demo player for the marketing offer pages (/vip, /promo). Hides
// itself if /greenroom-demo.mp4 is missing or fails to load, so a broken
// player never shows while the asset is still pending.
export function DemoVideo() {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <section className="relative z-10 px-5 pb-6 pt-8 sm:pt-10">
      <div className="relative mx-auto max-w-3xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-8 -z-0 rounded-[2.5rem] opacity-35 blur-[80px]"
          style={{ background: "radial-gradient(circle, rgba(57,181,74,0.45), transparent 70%)" }}
        />
        <video
          src="/greenroom-demo.mp4"
          autoPlay
          muted
          loop
          playsInline
          controls
          preload="metadata"
          onError={() => setFailed(true)}
          className="relative z-10 w-full rounded-2xl border border-white/10 bg-black shadow-[0_30px_90px_-25px_rgba(0,0,0,0.9)]"
        />
      </div>
    </section>
  );
}
