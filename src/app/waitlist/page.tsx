"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";

// Audio player component with waveform
function AudioTeaser({ src, title, bpm }: { src: string; title: string; bpm: number }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [bars] = useState(() => Array.from({ length: 32 }, () => Math.random() * 0.7 + 0.3));

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setProgress((audio.currentTime / audio.duration) * 100 || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  return (
    <div 
      className="relative bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4 cursor-pointer group hover:border-[#00FF88]/30 transition-all"
      onClick={togglePlay}
    >
      <audio ref={audioRef} src={src} preload="metadata" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button className="w-10 h-10 rounded-full bg-[#00FF88] flex items-center justify-center group-hover:scale-110 transition-transform">
            {isPlaying ? (
              <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <div>
            <p className="text-white font-medium text-sm">{title}</p>
            <p className="text-[#666] text-xs">{bpm} BPM</p>
          </div>
        </div>
        <div className="px-2 py-1 rounded bg-[#00FF88]/10 border border-[#00FF88]/20">
          <span className="text-[#00FF88] text-xs font-mono">PREVIEW</span>
        </div>
      </div>

      {/* Waveform */}
      <div className="flex items-center gap-[2px] h-12 relative">
        {bars.map((height, i) => {
          const isActive = (i / bars.length) * 100 <= progress;
          return (
            <div
              key={i}
              className="flex-1 rounded-full transition-all duration-100"
              style={{
                height: `${height * 100}%`,
                background: isActive 
                  ? '#00FF88' 
                  : isPlaying 
                    ? 'rgba(0,255,136,0.3)' 
                    : 'rgba(255,255,255,0.2)',
                transform: isPlaying ? `scaleY(${1 + Math.sin(Date.now() / 200 + i) * 0.1})` : 'scaleY(1)',
              }}
            />
          );
        })}
        
        {/* Progress overlay */}
        <div 
          className="absolute inset-0 bg-gradient-to-r from-transparent to-transparent pointer-events-none"
          style={{
            background: `linear-gradient(to right, transparent ${progress}%, rgba(0,0,0,0.3) ${progress}%)`,
          }}
        />
      </div>
    </div>
  );
}

// Floating particle component
function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[] = [];
    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.1,
      });
    }

    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 136, ${p.opacity})`;
        ctx.fill();
      });

      // Draw connecting lines
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach((p2) => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(0, 255, 136, ${0.1 * (1 - dist / 150)})`;
            ctx.stroke();
          }
        });
      });

      requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

// Audio waveform bars
function WaveformBars() {
  return (
    <div className="flex items-end justify-center gap-[3px] h-16 mb-8">
      {[...Array(40)].map((_, i) => (
        <div
          key={i}
          className="w-[3px] bg-gradient-to-t from-[#00FF88] to-[#00FF88]/30 rounded-full"
          style={{
            animation: `waveform 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.05}s`,
            height: "20%",
          }}
        />
      ))}
    </div>
  );
}

// Glitch text effect
function GlitchText({ children }: { children: string }) {
  return (
    <span className="relative inline-block">
      <span className="relative z-10">{children}</span>
      <span 
        className="absolute inset-0 text-[#00FF88] opacity-70 z-0"
        style={{
          animation: "glitch1 2.5s infinite",
          clipPath: "inset(0 0 0 0)",
        }}
      >
        {children}
      </span>
      <span 
        className="absolute inset-0 text-[#ff0088] opacity-70 z-0"
        style={{
          animation: "glitch2 2.5s infinite",
          clipPath: "inset(0 0 0 0)",
        }}
      >
        {children}
      </span>
    </span>
  );
}

// Ripple effect on click
function RippleBackground() {
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const newRipple = { x: e.clientX, y: e.clientY, id: Date.now() };
      setRipples((prev) => [...prev, newRipple]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
      }, 1000);
    };

    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-5 overflow-hidden">
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="absolute rounded-full border-2 border-[#00FF88]/50"
          style={{
            left: ripple.x,
            top: ripple.y,
            transform: "translate(-50%, -50%)",
            animation: "ripple 1s ease-out forwards",
          }}
        />
      ))}
    </div>
  );
}

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [mounted, setMounted] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setStatus("success");
      setMessage("You're on the list.");
      setEmail("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong");
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center px-4 overflow-hidden relative">
      {/* Custom styles */}
      <style jsx global>{`
        @keyframes waveform {
          0%, 100% { height: 20%; }
          50% { height: ${Math.random() * 60 + 40}%; }
        }
        
        @keyframes glitch1 {
          0%, 90%, 100% { transform: translate(0); }
          92% { transform: translate(-2px, 1px); }
          94% { transform: translate(2px, -1px); }
          96% { transform: translate(-1px, 2px); }
          98% { transform: translate(1px, -2px); }
        }
        
        @keyframes glitch2 {
          0%, 90%, 100% { transform: translate(0); }
          91% { transform: translate(2px, 1px); }
          93% { transform: translate(-2px, -1px); }
          95% { transform: translate(1px, 2px); }
          97% { transform: translate(-1px, -2px); }
        }
        
        @keyframes ripple {
          0% { width: 0; height: 0; opacity: 0.5; }
          100% { width: 500px; height: 500px; opacity: 0; }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        
        @keyframes borderGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(0,255,136,0.3), inset 0 0 20px rgba(0,255,136,0.1); }
          50% { box-shadow: 0 0 40px rgba(0,255,136,0.5), inset 0 0 30px rgba(0,255,136,0.2); }
        }
      `}</style>

      {/* Particle network */}
      <Particles />
      
      {/* Click ripples */}
      <RippleBackground />

      {/* Scanline effect */}
      <div className="fixed inset-0 pointer-events-none z-20 overflow-hidden opacity-[0.03]">
        <div 
          className="absolute w-full h-[2px] bg-[#00FF88]"
          style={{ animation: "scanline 3s linear infinite" }}
        />
      </div>

      {/* Vignette */}
      <div 
        className="fixed inset-0 pointer-events-none z-10"
        style={{
          background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.8) 100%)",
        }}
      />

      {/* Content */}
      <div className={`relative z-30 text-center max-w-2xl transition-all duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        
        {/* Waveform bars above logo */}
        <div className={`transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <WaveformBars />
        </div>

        {/* Logo with glow */}
        <div 
          className={`relative mb-6 transition-all duration-1000 delay-500 ${mounted && logoLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
          style={{ animation: mounted ? "float 6s ease-in-out infinite" : "none" }}
        >
          <div className="absolute inset-0 blur-2xl bg-[#00FF88]/20 scale-110" />
          <Image
            src="/greenroom-logo.png"
            alt="GREENROOM"
            width={450}
            height={70}
            className="relative mx-auto drop-shadow-[0_0_30px_rgba(0,255,136,0.5)]"
            priority
            onLoad={() => setLogoLoaded(true)}
          />
        </div>

        {/* V2 Badge with border animation */}
        <div className={`flex justify-center mb-8 transition-all duration-1000 delay-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div 
            className="px-6 py-2 rounded-full bg-[#0a0a0a] border border-[#00FF88]/50"
            style={{ animation: "borderGlow 2s ease-in-out infinite" }}
          >
            <span className="font-mono text-sm tracking-[0.3em] text-[#00FF88]">
              VERSION 2.0
            </span>
          </div>
        </div>

        {/* Main headline with glitch */}
        <h1 className={`text-4xl md:text-6xl font-black text-white mb-4 tracking-tight transition-all duration-1000 delay-900 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <GlitchText>THE FUTURE OF</GlitchText>
          <br />
          <span className="text-[#00FF88]">SOUND</span>
        </h1>

        <p className={`text-[#666] text-lg md:text-xl mb-12 max-w-md mx-auto transition-all duration-1000 delay-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          Premium samples. Instant access.<br />Built for creators who move fast.
        </p>

        {/* Waitlist Form */}
        <div className={`transition-all duration-1000 delay-1100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {status === "success" ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#00FF88]/20 flex items-center justify-center border border-[#00FF88]/50">
                <svg className="w-8 h-8 text-[#00FF88]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[#00FF88] text-xl font-medium">{message}</p>
              <p className="text-[#666]">We'll hit you up when it's time.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <div className="relative flex-1 group">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-6 py-4 bg-[#111] border border-[#2a2a2a] rounded-xl text-white placeholder-[#444] focus:outline-none focus:border-[#00FF88] focus:shadow-[0_0_20px_rgba(0,255,136,0.2)] transition-all text-lg"
                />
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#00FF88]/0 via-[#00FF88]/10 to-[#00FF88]/0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </div>
              <button
                type="submit"
                disabled={status === "loading"}
                className="px-8 py-4 bg-[#00FF88] text-black font-bold rounded-xl hover:bg-[#00cc6a] hover:shadow-[0_0_30px_rgba(0,255,136,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg whitespace-nowrap"
              >
                {status === "loading" ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    JOINING
                  </span>
                ) : (
                  "GET EARLY ACCESS"
                )}
              </button>
            </form>
          )}
          {status === "error" && (
            <p className="mt-4 text-red-400">{message}</p>
          )}
        </div>

        {/* Audio Teasers */}
        <div className={`mt-16 w-full max-w-lg transition-all duration-1000 delay-1100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <p className="text-[#666] text-sm mb-4 text-center tracking-wider">PREVIEW WHAT&apos;S COMING</p>
          <div className="space-y-3">
            <AudioTeaser 
              src="/teaser-1.mp3" 
              title="Midnight Drive" 
              bpm={120}
            />
            <AudioTeaser 
              src="/teaser-2.mp3" 
              title="Neon Dreams" 
              bpm={95}
            />
          </div>
        </div>

        {/* Bottom features */}
        <div className={`mt-16 flex flex-wrap justify-center gap-8 text-sm transition-all duration-1000 delay-1200 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          {["EXCLUSIVE DROPS", "INSTANT DOWNLOADS", "CREATOR PAYOUTS"].map((feature, i) => (
            <div key={feature} className="flex items-center gap-2 text-[#444]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00FF88]" />
              <span className="tracking-wider">{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Corner decorations */}
      <div className="fixed top-0 left-0 w-32 h-32 border-l-2 border-t-2 border-[#00FF88]/20 m-8" />
      <div className="fixed bottom-0 right-0 w-32 h-32 border-r-2 border-b-2 border-[#00FF88]/20 m-8" />
    </div>
  );
}
