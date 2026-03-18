import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background GIF */}
      <div className="absolute inset-0 opacity-30">
        <img
          src="https://greenroom.fm/cdn/shop/files/ezgif.com-video-to-gif_2048x2048.gif"
          alt=""
          className="w-full h-full object-cover"
        />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-4">
        {/* Logo */}
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/697bed99d794c79d63ec6b73/c33d47e0e_GREENROOMLOGOWHITE.png"
          alt="GREENROOM"
          className="h-8 md:h-10 mx-auto mb-6"
        />

        {/* Title */}
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-4">
          2.0
        </h1>

        {/* Subtitle */}
        <p className="text-xl md:text-2xl text-[#a1a1a1] mb-8">
          Coming Soon
        </p>

        {/* Sign In Link */}
        <Link
          href="/login"
          className="text-[#00FF88] hover:text-white transition text-sm font-medium"
        >
          Creator Sign In →
        </Link>
      </div>
    </div>
  );
}
