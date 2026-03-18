import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center pt-32 md:pt-48 relative overflow-hidden">
      {/* Background GIF */}
      <div className="absolute inset-0 opacity-30">
        <img
          src="https://greenroom.fm/cdn/shop/files/ezgif.com-video-to-gif_2048x2048.gif"
          alt=""
          className="w-full h-full object-cover"
        />
      </div>

      {/* Top Right Sign In */}
      <Link
        href="/login"
        className="absolute top-6 right-6 text-[#00FF88] hover:text-white transition text-sm font-medium z-20"
      >
        Creator Sign In →
      </Link>

      {/* Content */}
      <div className="relative z-10 text-center px-4">
        {/* Title */}
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-4">
          Greenroom 2.0
        </h1>

        {/* Subtitle */}
        <p className="text-xl md:text-2xl text-[#a1a1a1]">
          Coming Soon
        </p>
      </div>
    </div>
  );
}
