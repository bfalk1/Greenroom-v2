"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Layers, Sparkles, Coins, Users, ArrowRight } from "lucide-react";
import { eurostile, display } from "@/lib/fonts";

const FEATURES = [
  {
    icon: Layers,
    title: "A Deep Crate",
    body: "Thousands of loops and one-shots, tagged by key, BPM and genre. Audition in the browser, grab what moves you.",
  },
  {
    icon: Sparkles,
    title: "Presets That Pop",
    body: "Serum, Vital, Astra and more — ready-to-load patches from sound designers who live inside the synth.",
  },
  {
    icon: Coins,
    title: "Credits, Not Clutter",
    body: "Subscribe, get monthly credits, download exactly what you need. Whatever you pull is yours to keep.",
  },
  {
    icon: Users,
    title: "Back the Creators",
    body: "Follow the producers you love, support the sound, and catch the drop the moment it lands.",
  },
];

const GENRES = [
  "Hip-Hop", "Trap", "R&B", "House", "Lo-Fi", "Drill",
  "Afrobeats", "Techno", "Soul", "Ambient", "Funk", "Pop",
];

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

function DemoVideo() {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <section className="relative z-10 -mt-16 px-5 sm:-mt-20">
      <Reveal>
        <div className="relative mx-auto max-w-5xl">
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
      </Reveal>
    </section>
  );
}

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`${eurostile.variable} relative min-h-screen bg-[#050505] text-white overflow-x-hidden`}
      style={{ fontFamily: "var(--font-eurostile)" }}
    >
      <style>{`
        @keyframes gr-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
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
            ? "bg-black/70 backdrop-blur-md border-b border-white/5 py-3"
            : "bg-transparent py-5"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/">
            <img src="/greenroom-2-logo.png" alt="GREENROOM" className="h-6 md:h-7" />
          </Link>
          <nav className="flex items-center gap-3 sm:gap-5">
            <Link
              href="/login"
              className="whitespace-nowrap text-sm font-medium text-[#a1a1a1] transition hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-[#39b54a] px-5 py-2 text-sm font-bold text-black transition hover:bg-[#2e9140] hover:shadow-[0_0_24px_rgba(0,255,136,0.45)]"
            >
              Join
            </Link>
          </nav>
        </div>
      </header>

      {/* ---------- HERO ---------- */}
      <section className="relative flex h-screen min-h-[640px] flex-col items-center justify-center overflow-hidden px-5 text-center">
        {/* Background webp ("the gif") */}
        <div className="absolute inset-0">
          <img src="/background.webp" alt="" className="h-full w-full object-cover" />
        </div>
        {/* Legibility overlays — heavy center scrim so the gif's baked-in text recedes behind the headline */}
        <div className="absolute inset-0 bg-black/35" />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(5,5,5,0.18) 0%, rgba(5,5,5,0.68) 28%, #050505 44%, #050505 74%, rgba(5,5,5,0.5) 88%, #050505 100%)" }}
        />

        {/* Hero content */}
        <div className="relative z-10 flex flex-col items-center">
          <h1
            style={display}
            className={`max-w-5xl text-[clamp(2.8rem,9vw,7.5rem)] uppercase leading-[0.92] tracking-[-0.01em] transition-all duration-1000 delay-150 ${
              mounted ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
            }`}
          >
            <span className="block text-white">Welcome to</span>
            <span
              className="block text-[#39b54a]"
              style={{ textShadow: "0 0 60px rgba(0,255,136,0.45)" }}
            >
              the Greenroom
            </span>
          </h1>

          <p
            className={`mt-7 max-w-xl text-base leading-relaxed text-[#c9c9c9] sm:text-lg transition-all duration-1000 delay-300 ${
              mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            Step backstage. The loops, one-shots and presets shaping tomorrow&apos;s
            records — all waiting in one room.
          </p>

          <div
            className={`mt-9 flex flex-col items-center gap-3 sm:flex-row transition-all duration-1000 delay-500 ${
              mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 rounded-full bg-[#39b54a] px-8 py-4 text-base font-bold text-black transition hover:bg-[#2e9140] hover:shadow-[0_0_36px_rgba(0,255,136,0.5)]"
            >
              Step inside
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition hover:border-white/40 hover:bg-white/10"
            >
              Browse samples
            </Link>
          </div>
        </div>

      </section>

      {/* ---------- DEMO VIDEO ---------- */}
      {/* Hides itself if /greenroom-demo.mp4 is missing or fails to load. */}
      <DemoVideo />

      {/* ---------- TEASER ---------- */}
      <section className="relative px-5 py-28 sm:py-36">
        {/* ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[420px] w-[620px] -translate-x-1/2 rounded-full opacity-30 blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(57,181,74,0.55), transparent 70%)" }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-[#39b54a]">
              So, what is the Greenroom?
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h2
              style={display}
              className="text-[clamp(2rem,5.5vw,4rem)] uppercase leading-[0.98] tracking-[-0.01em] text-white"
            >
              Every great track starts backstage.
            </h2>
          </Reveal>
          <Reveal delay={200}>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-[#a1a1a1]">
              Greenroom is a curated marketplace where producers and sound designers
              drop their best samples and presets — and where the next wave of artists
              comes to dig. No bloated packs. No filler. Just the sounds worth building on.
            </p>
          </Reveal>
        </div>

        {/* Feature grid */}
        <div className="mx-auto mt-20 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <Reveal key={f.title} delay={i * 120}>
                <div className="group h-full rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.06] to-white/[0.01] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[#39b54a]/40 hover:shadow-[0_18px_50px_-20px_rgba(0,255,136,0.45)]">
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[#39b54a]/25 bg-[#39b54a]/10 text-[#39b54a] transition-colors group-hover:bg-[#39b54a]/20">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-white">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-[#9a9a9a]">{f.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ---------- GENRE MARQUEE ---------- */}
      <section className="relative border-y border-white/5 bg-black/40 py-8">
        <div className="flex w-max" style={{ animation: "gr-marquee 38s linear infinite" }}>
          {[...GENRES, ...GENRES].map((g, i) => (
            <div key={i} className="flex items-center">
              <span
                style={display}
                className="px-8 text-2xl uppercase tracking-wide text-white/35 sm:text-3xl"
              >
                {g}
              </span>
              <span className="text-[#39b54a]">●</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- FINAL CTA ---------- */}
      <section className="relative overflow-hidden px-5 py-32 text-center">
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
              className="text-[clamp(2.4rem,7vw,5rem)] uppercase leading-[0.95] tracking-[-0.01em]"
            >
              Ready to step inside?
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mt-6 max-w-md text-lg text-[#bdbdbd]">
              Join the room and start pulling the sounds that set your records apart.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2 rounded-full bg-[#39b54a] px-10 py-4 text-base font-bold text-black transition hover:bg-[#2e9140] hover:shadow-[0_0_40px_rgba(0,255,136,0.55)]"
              >
                Get started
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/login" className="text-sm font-medium text-[#a1a1a1] transition hover:text-white">
                Already a creator? Sign in
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
            <Link href="/marketplace" className="transition hover:text-white">Marketplace</Link>
            <Link href="/pricing" className="transition hover:text-white">Pricing</Link>
            <Link href="/creator/apply" className="transition hover:text-white">For Creators</Link>
          </div>
          <p className="text-xs text-[#555]">© {new Date().getFullYear()} Greenroom</p>
        </div>
      </footer>
    </div>
  );
}
