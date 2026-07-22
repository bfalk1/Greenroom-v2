"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  AudioLines,
  BadgeCheck,
  CircleDollarSign,
  Infinity as InfinityIcon,
  ShieldCheck,
  Star,
  Zap,
} from "lucide-react";
import { eurostile, display } from "@/lib/fonts";
import { trackLandingCta } from "@/lib/analytics";
import { MarketplacePreview } from "@/components/landing/MarketplacePreview";

/* ------------------------------------------------------------------ */
/*  Content                                                            */
/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    icon: AudioLines,
    title: "Original sounds",
    body: "Exclusive loops, one-shots and presets from verified creators. No bloated packs, no filler.",
  },
  {
    icon: InfinityIcon,
    title: "Credits never expire",
    body: "Buy credits once and keep them forever — even if you cancel. Whatever you pull is yours.",
  },
  {
    icon: CircleDollarSign,
    title: "Creators get paid",
    body: "Every download pays the producer who made it. Real support, real royalties.",
  },
  {
    icon: Zap,
    title: "Fast by design",
    body: "Preview in the browser, filter by key and BPM, and grab what you need in seconds.",
  },
];

const PRODUCER_NAMES = [
  "Juelz",
  "Kompany",
  "Drezo",
  "Henry Fong",
  "Montell2099",
  "Ekali",
  "Gravedgr",
];

interface LandingSample {
  id: string;
  name: string;
  artist_name?: string;
  creator_id: string;
  creator_avatar?: string | null;
  genre?: string;
  sample_type?: string;
  key?: string;
  bpm?: number;
  tags?: string[];
  preview_url?: string;
  waveform_data?: number[] | null;
}

/* ------------------------------------------------------------------ */
/*  Scroll reveal                                                      */
/* ------------------------------------------------------------------ */

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-[900ms] ease-out ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Equalizer strip — the signature motif. Deterministic values only   */
/*  (no Math.random) so SSR and client markup match.                   */
/* ------------------------------------------------------------------ */

function EqStrip({ bars = 56, className = "" }: { bars?: number; className?: string }) {
  return (
    <div aria-hidden className={`flex items-end justify-center gap-[3px] ${className}`}>
      {Array.from({ length: bars }, (_, i) => {
        const h = 6 + ((i * 53) % 34);
        const dur = 900 + ((i * 89) % 700);
        const delay = (i * 137) % 800;
        return (
          <span
            key={i}
            className="gr-eq-bar w-[3px] rounded-full bg-[#39b54a]"
            style={{
              height: `${h}px`,
              animationDuration: `${dur}ms`,
              animationDelay: `${delay}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero media — demo video with a CSS fallback if the file 404s      */
/* ------------------------------------------------------------------ */

function HeroMedia() {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-0 rounded-[3rem] opacity-40 blur-[90px]"
        style={{ background: "radial-gradient(circle, rgba(57,181,74,0.5), transparent 70%)" }}
      />
      <div className="relative z-10 overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        {failed ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-6 bg-[radial-gradient(circle_at_top,rgba(57,181,74,0.14),transparent_60%)]">
            <img src="/greenroom-2-logo.png" alt="GREENROOM" className="h-8 opacity-90" />
            <EqStrip bars={40} className="h-12 opacity-60" />
          </div>
        ) : (
          <video
            src="/greenroom-demo.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
            className="aspect-video w-full object-cover"
          />
        )}
      </div>
      {/* floating chip */}
      <div className="absolute -bottom-4 left-6 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-black/80 px-4 py-2 backdrop-blur">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#39b54a] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#39b54a]" />
        </span>
        <span className="text-xs font-semibold tracking-wide text-[#c9c9c9]">
          Inside the marketplace
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Live preview strip — real samples, actually playable              */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [samples, setSamples] = useState<LandingSample[]>([]);
  const [sampleTotal, setSampleTotal] = useState<number | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // One fetch feeds the preview strip, the creator grid and the live
  // sample-count stat. The page degrades gracefully if it fails.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/samples?sortBy=popular&sortDir=desc&limit=24", {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        setSamples(Array.isArray(data.samples) ? data.samples : []);
        if (typeof data.total === "number") setSampleTotal(data.total);
      } catch {
        /* landing page works fine without live data */
      }
    })();
    return () => controller.abort();
  }, []);

  const previewSamples = useMemo(
    () => samples.filter((s) => s.preview_url).slice(0, 4),
    [samples]
  );

  const creators = useMemo(() => {
    const seen = new Set<string>();
    const list: { name: string; avatar: string; genre?: string }[] = [];
    for (const s of samples) {
      const name = s.artist_name?.trim();
      if (!name || !s.creator_avatar || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      list.push({ name, avatar: s.creator_avatar, genre: s.genre });
      if (list.length === 7) break;
    }
    return list;
  }, [samples]);

  return (
    <div
      className={`${eurostile.variable} relative min-h-screen overflow-x-hidden bg-[#050505] text-white`}
      style={{ fontFamily: "var(--font-eurostile)" }}
    >
      <style>{`
        @keyframes gr-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes gr-eq { from { transform: scaleY(0.25); } to { transform: scaleY(1); } }
        .gr-eq-bar {
          transform-origin: bottom;
          animation-name: gr-eq;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          animation-direction: alternate;
        }
        @media (prefers-reduced-motion: reduce) {
          .gr-eq-bar, .gr-marquee-track { animation: none !important; }
        }
      `}</style>

      {/* Grain overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[60] opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: "180px 180px",
        }}
      />

      {/* ---------- NAV ---------- */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
          scrolled
            ? "border-b border-white/5 bg-black/70 py-3 backdrop-blur-md"
            : "bg-transparent py-5"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/">
            <img src="/greenroom-2-logo.png" alt="GREENROOM" className="h-6 md:h-7" />
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <Link
              href="/pricing"
              onClick={() => trackLandingCta("nav_pricing")}
              className="text-sm font-medium text-[#a1a1a1] transition hover:text-white"
            >
              Pricing
            </Link>
          </nav>
          <div className="flex items-center gap-3 sm:gap-5">
            <Link
              href="/login"
              onClick={() => trackLandingCta("nav_signin")}
              className="whitespace-nowrap text-sm font-medium text-[#a1a1a1] transition hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/pricing"
              onClick={() => trackLandingCta("nav_join")}
              className="rounded-full bg-[#39b54a] px-5 py-2 text-sm font-bold text-black transition hover:bg-[#2e9140] hover:shadow-[0_0_24px_rgba(0,255,136,0.45)]"
            >
              Join
            </Link>
          </div>
        </div>
      </header>

      {/* ---------- HERO ---------- */}
      <section className="relative overflow-hidden px-5 pb-24 pt-32 sm:px-8 sm:pt-40 lg:pb-32">
        {/* ambient glows */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-[-10%] h-[560px] w-[560px] rounded-full opacity-25 blur-[140px]"
          style={{ background: "radial-gradient(circle, rgba(57,181,74,0.55), transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#39b54a]/40 to-transparent"
        />

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          {/* Copy */}
          <div>
            <h1
              style={display}
              className={`text-[clamp(2.6rem,5.4vw,4.6rem)] uppercase leading-[0.95] tracking-[-0.01em] transition-all duration-1000 delay-100 ${
                mounted ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
              }`}
            >
              <span className="block text-white">The marketplace</span>
              <span className="block text-white">
                for{" "}
                <span
                  className="text-[#39b54a]"
                  style={{ textShadow: "0 0 60px rgba(0,255,136,0.45)" }}
                >
                  music producers.
                </span>
              </span>
            </h1>

            <p
              className={`mt-6 max-w-md text-base leading-relaxed text-[#b5b5b5] transition-all duration-1000 delay-300 ${
                mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
              }`}
            >
              Discover original sounds from verified creators and download them
              with credits that never expire.
            </p>

            <div
              className={`mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center transition-all duration-1000 delay-500 ${
                mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
              }`}
            >
              <Link
                href="/pricing"
                onClick={() => trackLandingCta("hero_pricing")}
                className="group inline-flex items-center gap-2 rounded-full bg-[#39b54a] px-8 py-4 text-base font-bold text-black transition hover:bg-[#2e9140] hover:shadow-[0_0_36px_rgba(0,255,136,0.5)]"
              >
                Get started
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/pricing"
                onClick={() => trackLandingCta("hero_browse")}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#c9c9c9] transition hover:text-[#39b54a]"
              >
                Browse the sounds first
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* trust row */}
            <div
              className={`mt-12 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-white/8 pt-6 transition-all duration-1000 delay-700 ${
                mounted ? "opacity-100" : "opacity-0"
              }`}
            >
              {[
                { icon: InfinityIcon, label: "Credits never expire" },
                { icon: ShieldCheck, label: "Verified creators" },
                { icon: CircleDollarSign, label: "Creators earn royalties" },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="flex items-center gap-2 text-xs font-medium text-[#8a8a8a]">
                  <Icon className="h-3.5 w-3.5 text-[#39b54a]" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Media */}
          <div
            className={`transition-all duration-1000 delay-300 ${
              mounted ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
          >
            <HeroMedia />
          </div>
        </div>

        {/* faint EQ under the hero */}
        <EqStrip className="pointer-events-none mx-auto mt-20 hidden h-12 max-w-5xl opacity-[0.14] lg:flex" />
      </section>

      {/* ---------- PRODUCER NAMES MARQUEE ---------- */}
      <section className="relative border-y border-white/5 bg-black/40 py-6">
        <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-[#666]">
          Sounds from producers including
        </p>
        <div className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#050505] to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#050505] to-transparent"
          />
          <div
            className="gr-marquee-track flex w-max"
            style={{ animation: "gr-marquee 32s linear infinite" }}
          >
            {[...PRODUCER_NAMES, ...PRODUCER_NAMES].map((name, i) => (
              <div key={i} className="flex items-center">
                <span
                  style={display}
                  className="px-8 text-xl uppercase tracking-wide text-white/45 sm:text-2xl"
                >
                  {name}
                </span>
                <span className="text-[10px] text-[#39b54a]/60">●</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- WHY ---------- */}
      <section className="relative px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-[#39b54a]">
              Why Greenroom
            </p>
          </Reveal>
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <Reveal delay={80}>
              <h2
                style={display}
                className="max-w-xl text-[clamp(1.9rem,4vw,3.2rem)] uppercase leading-[0.98] tracking-[-0.01em] text-white"
              >
                Built for producers who dig deeper.
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="max-w-sm text-sm leading-relaxed text-[#8a8a8a]">
                A curated marketplace — not a content dump. Every sound is made
                by a real producer and worth building on.
              </p>
            </Reveal>
          </div>

          <div className="mt-16 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={f.title} delay={i * 110}>
                  <div className="group border-t border-white/10 pt-6 transition-colors duration-300 hover:border-[#39b54a]/60">
                    <div className="mb-5 flex items-center justify-between">
                      <Icon className="h-5 w-5 text-[#39b54a]" />
                      <span className="text-xs font-semibold tracking-[0.2em] text-[#4a4a4a]">
                        0{i + 1}
                      </span>
                    </div>
                    <h3 className="mb-2 text-base font-bold text-white">{f.title}</h3>
                    <p className="text-sm leading-relaxed text-[#9a9a9a]">{f.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- MARKETPLACE PREVIEW ---------- */}
      {previewSamples.length > 0 && (
        <section className="relative px-5 py-24 sm:px-8 sm:py-32">
          <div
            aria-hidden
            className="pointer-events-none absolute right-[-10%] top-1/4 h-[420px] w-[520px] rounded-full opacity-20 blur-[130px]"
            style={{ background: "radial-gradient(circle, rgba(57,181,74,0.5), transparent 70%)" }}
          />
          <div className="relative mx-auto max-w-5xl">
            <div className="mb-10 flex flex-col gap-5 sm:mb-12 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <Reveal>
                  <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-[#39b54a]">
                    Preview browser
                  </p>
                </Reveal>
                <Reveal delay={80}>
                  <h2
                    style={display}
                    className="max-w-md text-[clamp(1.9rem,4vw,3.2rem)] uppercase leading-[0.98] tracking-[-0.01em] text-white"
                  >
                    Play with the marketplace.
                  </h2>
                </Reveal>
              </div>
              <Reveal delay={160}>
                <p className="max-w-sm text-sm leading-relaxed text-[#9a9a9a]">
                  Search, filter and audition real creator uploads right here —
                  no account. Downloads and the full catalog unlock when you join.
                </p>
              </Reveal>
            </div>

            <Reveal delay={120}>
              <MarketplacePreview samples={samples} total={sampleTotal} />
            </Reveal>

            <Reveal delay={200}>
              <div className="mt-6 text-center">
                <Link
                  href="/pricing"
                  onClick={() => trackLandingCta("preview_browser")}
                  className="group inline-flex items-center gap-2 text-sm font-semibold text-[#c9c9c9] transition hover:text-[#39b54a]"
                >
                  Open the full preview browser
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ---------- CREATORS ---------- */}
      {creators.length >= 4 && (
        <section className="relative px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-7xl">
            <Reveal>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-[#39b54a]">
                Verified creators
              </p>
            </Reveal>
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <Reveal delay={80}>
                <h2
                  style={display}
                  className="max-w-2xl text-[clamp(1.9rem,4vw,3.2rem)] uppercase leading-[0.98] tracking-[-0.01em] text-white"
                >
                  Real producers.{" "}
                  <span className="text-[#39b54a]">Original sounds.</span>
                </h2>
              </Reveal>
              <Reveal delay={160}>
                <Link
                  href="/pricing"
                  onClick={() => trackLandingCta("creators_more")}
                  className="group inline-flex items-center gap-2 text-sm font-semibold text-[#c9c9c9] transition hover:text-[#39b54a]"
                >
                  Browse all creators
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Reveal>
            </div>

            <div className="mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-4 md:overflow-visible md:pb-0">
              {creators.map((c, i) => (
                <Reveal key={c.name} delay={i * 80} className="min-w-[170px] snap-start md:min-w-0">
                  <Link
                    href={`/artist/${encodeURIComponent(c.name)}`}
                    onClick={() => trackLandingCta("creator_card")}
                    className="group block overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] transition-all duration-300 hover:-translate-y-1 hover:border-[#39b54a]/40 hover:shadow-[0_18px_50px_-20px_rgba(0,255,136,0.35)]"
                  >
                    <div className="relative aspect-square overflow-hidden">
                      <img
                        src={c.avatar}
                        alt={c.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      <BadgeCheck className="absolute left-3 top-3 h-5 w-5 text-[#39b54a] drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]" />
                    </div>
                    <div className="px-4 py-3">
                      <p className="truncate text-sm font-bold uppercase tracking-wide text-white">
                        {c.name}
                      </p>
                      <p className="truncate text-xs text-[#8a8a8a]">{c.genre || "Producer"}</p>
                    </div>
                  </Link>
                </Reveal>
              ))}
              {/* "& more" tile */}
              <Reveal delay={creators.length * 80} className="min-w-[170px] snap-start md:min-w-0">
                <Link
                  href="/pricing"
                  onClick={() => trackLandingCta("creators_more")}
                  className="group flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.01] text-[#8a8a8a] transition-all duration-300 hover:border-[#39b54a]/50 hover:text-[#39b54a]"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-current">
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="text-sm font-bold uppercase tracking-wide">& more</span>
                </Link>
              </Reveal>
            </div>
          </div>
        </section>
      )}

      {/* ---------- STATS ---------- */}
      {/* Honest, live catalog count only — no hardcoded vanity metrics.
          Hidden until the real number is meaningful so it never overstates. */}
      {sampleTotal !== null && sampleTotal >= 500 && (
        <section className="relative border-y border-white/5 bg-black/40 px-5 py-16 sm:px-8">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p
              style={display}
              className="text-[clamp(2.4rem,6vw,4rem)] uppercase leading-none text-white"
            >
              {sampleTotal.toLocaleString("en-US")}
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#39b54a]">
              original sounds in the room — and counting
            </p>
          </Reveal>
        </section>
      )}

      {/* ---------- QUOTE ---------- */}
      <section className="relative px-5 py-24 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <div className="mb-6 flex items-center justify-center gap-1">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className="h-4 w-4 text-[#39b54a]" fill="currentColor" />
              ))}
            </div>
          </Reveal>
          <Reveal delay={100}>
            <blockquote className="text-2xl font-medium leading-snug text-white sm:text-3xl">
              &ldquo;Greenroom samples are the sh*t. Definitely check them
              out.&rdquo;
            </blockquote>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-6 text-sm font-semibold uppercase tracking-[0.25em] text-[#8a8a8a]">
              — Marshmello
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---------- FINAL CTA ---------- */}
      <section className="relative overflow-hidden px-5 pb-32 pt-10 text-center sm:px-8">
        <div className="absolute inset-0 -z-0">
          <div
            className="absolute left-1/2 top-1/2 h-[380px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[130px]"
            style={{ background: "radial-gradient(circle, rgba(57,181,74,0.6), transparent 70%)" }}
          />
        </div>
        <div className="relative z-10 mx-auto max-w-2xl">
          <Reveal>
            <h2
              style={display}
              className="text-[clamp(2.2rem,6vw,4.4rem)] uppercase leading-[0.95] tracking-[-0.01em]"
            >
              Ready to find your{" "}
              <span
                className="text-[#39b54a]"
                style={{ textShadow: "0 0 60px rgba(0,255,136,0.45)" }}
              >
                next sound?
              </span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mt-6 max-w-md text-base text-[#bdbdbd]">
              Discover and support original sounds from verified creators —
              with credits that never expire.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/pricing"
                onClick={() => trackLandingCta("final_pricing")}
                className="group inline-flex items-center gap-2 rounded-full bg-[#39b54a] px-10 py-4 text-base font-bold text-black transition hover:bg-[#2e9140] hover:shadow-[0_0_40px_rgba(0,255,136,0.55)]"
              >
                Get started
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/login"
                onClick={() => trackLandingCta("final_signin")}
                className="text-sm font-medium text-[#a1a1a1] transition hover:text-white"
              >
                Already a member? Sign in
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- FOOTER ---------- */}
      <footer className="border-t border-white/5 bg-[#050505] px-5 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <img src="/greenroom-2-logo.png" alt="GREENROOM" className="h-6 opacity-80" />
          <div className="flex items-center gap-6 text-sm text-[#777]">
            <Link href="/pricing" className="transition hover:text-white">Pricing</Link>
          </div>
          <p className="text-xs text-[#555]">© {new Date().getFullYear()} Greenroom</p>
        </div>
      </footer>
    </div>
  );
}
