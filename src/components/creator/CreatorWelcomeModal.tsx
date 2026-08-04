"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/lib/hooks/useUser";
import { Button } from "@/components/ui/button";
import { PartyPopper, UploadCloud, Monitor, Copy, Check, X } from "lucide-react";
import {
  trackCreatorWelcomeShown,
  trackCreatorWelcomeCta,
} from "@/lib/analytics";

const DASHBOARD_PATH = "/creator/dashboard";
const WEBSITE_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL || "https://greenroom.fm";

// ── Fireworks ────────────────────────────────────────────────────────────────
// Pure CSS, no dependency and no canvas. Particle vectors are precomputed at
// module load so every render is identical (no hydration drift, no rAF loop).
const BURSTS = [
  { left: "18%", top: "26%", color: "#39b54a", delay: 0 },
  { left: "80%", top: "20%", color: "#ffd166", delay: 0.3 },
  { left: "50%", top: "10%", color: "#ffffff", delay: 0.6 },
  { left: "10%", top: "72%", color: "#7ee787", delay: 0.9 },
  { left: "88%", top: "66%", color: "#39b54a", delay: 1.2 },
  { left: "32%", top: "88%", color: "#ffd166", delay: 1.5 },
  { left: "68%", top: "90%", color: "#7ee787", delay: 1.8 },
];
const PARTICLES_PER_BURST = 18;

const PARTICLES = BURSTS.map((burst, burstIndex) =>
  Array.from({ length: PARTICLES_PER_BURST }, (_, i) => {
    const angle = (i / PARTICLES_PER_BURST) * Math.PI * 2;
    // Alternating radius gives the burst a ragged, less mechanical edge.
    const radius = i % 2 === 0 ? 132 : 86;
    return {
      key: `${burstIndex}-${i}`,
      tx: `${Math.round(Math.cos(angle) * radius)}px`,
      ty: `${Math.round(Math.sin(angle) * radius)}px`,
    };
  })
);

const FIREWORKS_CSS = `
@keyframes gr-fw-particle {
  0%   { transform: translate3d(0, 0, 0) scale(1); opacity: 1; }
  60%  { opacity: 1; }
  100% { transform: translate3d(var(--gr-tx), calc(var(--gr-ty) + 26px), 0) scale(0.3); opacity: 0; }
}
@keyframes gr-fw-flash {
  0%   { transform: scale(0.2); opacity: 0.85; }
  100% { transform: scale(3.2); opacity: 0; }
}
.gr-fw-burst { position: absolute; width: 0; height: 0; }
.gr-fw-flash {
  position: absolute; left: -14px; top: -14px; width: 28px; height: 28px;
  border-radius: 9999px;
  animation: gr-fw-flash 1.5s ease-out var(--gr-delay) 3 both;
}
.gr-fw-particle {
  position: absolute; left: -3px; top: -3px; width: 6px; height: 6px;
  border-radius: 9999px;
  animation: gr-fw-particle 1.5s ease-out var(--gr-delay) 3 both;
}
@media (prefers-reduced-motion: reduce) {
  .gr-fw { display: none; }
}
`;

function Fireworks() {
  return (
    <div className="gr-fw pointer-events-none absolute inset-0 overflow-hidden">
      <style>{FIREWORKS_CSS}</style>
      {BURSTS.map((burst, burstIndex) => (
        <div
          key={burst.left + burst.top}
          className="gr-fw-burst"
          style={{ left: burst.left, top: burst.top }}
        >
          <span
            className="gr-fw-flash"
            style={
              {
                background: `radial-gradient(circle, ${burst.color} 0%, transparent 70%)`,
                "--gr-delay": `${burst.delay}s`,
              } as React.CSSProperties
            }
          />
          {PARTICLES[burstIndex].map((p) => (
            <span
              key={p.key}
              className="gr-fw-particle"
              style={
                {
                  background: burst.color,
                  boxShadow: `0 0 8px ${burst.color}`,
                  "--gr-tx": p.tx,
                  "--gr-ty": p.ty,
                  "--gr-delay": `${burst.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
// One-time congratulations for a creator whose application was just approved.
// Gated on `creator_welcome_seen_at` being null (see /api/user/me); existing
// creators were backfilled by the migration so only new approvals see it.
export function CreatorWelcomeModal({ isDesktop }: { isDesktop: boolean }) {
  const { user, loading, refreshUser } = useUser();
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const shownRef = useRef(false);

  const contentCount = user?.creator_content_count ?? 0;
  // "nudge" = a long-standing creator whose flag was re-armed because their
  // profile is still empty. Congratulating them on an approval from months ago
  // would read as a bug, so the copy (and the fireworks) change.
  const isNudge = user?.creator_welcome_variant === "nudge";
  const show =
    !loading &&
    !dismissed &&
    !!user?.is_creator &&
    !user?.creator_welcome_seen_at;

  useEffect(() => {
    if (!show || shownRef.current) return;
    shownRef.current = true;
    trackCreatorWelcomeShown({
      contentCount,
      platform: isDesktop ? "desktop_app" : "web",
      variant: isNudge ? "nudge" : "approved",
    });
  }, [show, contentCount, isDesktop, isNudge]);

  if (!show) return null;

  const analyticsProps = {
    contentCount,
    platform: isDesktop ? ("desktop_app" as const) : ("web" as const),
    variant: isNudge ? ("nudge" as const) : ("approved" as const),
  };

  // Record the dismissal server-side, but never let a failed write trap the
  // user behind the modal — it closes locally either way and simply reappears
  // on the next load if the write didn't land.
  const dismiss = async (cta: "upload_now" | "dismiss") => {
    trackCreatorWelcomeCta(cta, analyticsProps);
    setDismissed(true);
    try {
      const res = await fetch("/api/user/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator_welcome_seen_at: new Date().toISOString() }),
      });
      if (res.ok) await refreshUser();
    } catch {
      // Non-fatal — see above.
    }
  };

  // The desktop shell blocks /creator routes, so uploading has to happen in a
  // real browser. Prefer the preload bridge (opens the default browser); older
  // shells without it fall back to copying the URL.
  const openOnWebsite = async () => {
    const bridge = (
      window as { greenroom?: { openWebsite?: (path: string) => void } }
    ).greenroom;
    if (bridge?.openWebsite) {
      bridge.openWebsite(DASHBOARD_PATH);
      void dismiss("upload_now");
      return;
    }
    try {
      await navigator.clipboard.writeText(`${WEBSITE_ORIGIN}${DASHBOARD_PATH}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const firstName = user?.artist_name || user?.full_name?.split(" ")[0];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      {!isNudge && <Fireworks />}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-welcome-title"
        className={
          isNudge
            ? "relative bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            : "relative bg-[#1a1a1a] border border-[#39b54a]/30 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-[0_0_70px_-12px_rgba(57,181,74,0.5)]"
        }
      >
        <button
          onClick={() => dismiss("dismiss")}
          aria-label="Close"
          className="absolute right-4 top-4 text-[#a1a1a1] hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-full bg-[#39b54a]/15 border border-[#39b54a]/30 flex items-center justify-center mb-4">
          {isNudge ? (
            <UploadCloud className="w-6 h-6 text-[#39b54a]" />
          ) : (
            <PartyPopper className="w-6 h-6 text-[#39b54a]" />
          )}
        </div>

        <h3
          id="creator-welcome-title"
          className="text-xl font-semibold text-white mb-2"
        >
          {isNudge
            ? "Your profile is still empty"
            : firstName
              ? `Congratulations, ${firstName}!`
              : "Congratulations!"}
        </h3>
        <p className="text-[#a1a1a1] text-sm mb-4">
          {isNudge ? (
            <>
              You&apos;re a Greenroom creator, but you haven&apos;t uploaded
              anything yet — so there&apos;s nothing on your artist profile for
              buyers to find.
            </>
          ) : (
            <>
              Your application was approved — you&apos;re officially a Greenroom
              creator. Your artist profile is live and ready for sounds.
            </>
          )}
        </p>

        <div className="rounded-md border border-[#2a2a2a] bg-[#141414] p-4 mb-5">
          <div className="flex items-start gap-3">
            <UploadCloud className="w-5 h-5 text-[#39b54a] shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-white font-medium mb-1">
                {isNudge
                  ? "Upload your first samples"
                  : contentCount === 0
                    ? "You haven't uploaded any samples yet"
                    : "Keep the uploads coming"}
              </p>
              <p className="text-[#a1a1a1]">
                {contentCount === 0 ? (
                  <>
                    Head to your creator dashboard to upload samples and presets
                    — that&apos;s what buyers will see, and it&apos;s what earns
                    you credits.
                  </>
                ) : (
                  <>
                    You have {contentCount}{" "}
                    {contentCount === 1 ? "upload" : "uploads"} so far. Add more
                    from your creator dashboard to fill out your profile.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {isDesktop && (
          <div className="rounded-md border border-[#2a2a2a] bg-[#141414] p-4 mb-5">
            <div className="flex items-start gap-3">
              <Monitor className="w-5 h-5 text-[#a1a1a1] shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-white font-medium mb-1">
                  Uploading happens on the website
                </p>
                <p className="text-[#a1a1a1]">
                  The desktop app can&apos;t open the creator dashboard. Sign in
                  at{" "}
                  <span className="text-white">
                    greenroom.fm{DASHBOARD_PATH}
                  </span>{" "}
                  in your browser to upload.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {isDesktop ? (
            <Button
              onClick={openOnWebsite}
              className="w-full bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Link copied — paste it in your browser
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Open dashboard in browser
                </>
              )}
            </Button>
          ) : (
            <Link href={DASHBOARD_PATH} onClick={() => dismiss("upload_now")}>
              <Button className="w-full bg-[#39b54a] text-black hover:bg-[#2e9140] font-semibold">
                Upload my samples
              </Button>
            </Link>
          )}
          <Button
            onClick={() => dismiss("dismiss")}
            variant="ghost"
            className="w-full text-[#a1a1a1] hover:text-white hover:bg-[#2a2a2a]"
          >
            {isDesktop ? "Got it" : "I'll do it later"}
          </Button>
        </div>
      </div>
    </div>
  );
}
