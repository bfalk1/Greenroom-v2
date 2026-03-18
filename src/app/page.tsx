import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background GIF */}
      <div className="absolute inset-0">
        <img
          src="https://greenroom.fm/cdn/shop/files/ezgif.com-video-to-gif_2048x2048.gif"
          alt=""
          className="w-full h-full object-cover"
        />
      </div>

      {/* Top Right Sign In */}
      <Link
        href="/login"
        className="absolute top-6 right-6 text-[#39b54a] hover:text-white transition text-sm font-medium z-20"
      >
        Creator Sign In →
      </Link>

      {/* Content */}
      <div className="relative z-10 text-center w-full">
        {/* Black bar with logo */}
        <div className="bg-black py-4 px-8">
          <img
            src="/greenroom-2-logo.png"
            alt="GREENROOM 2.0"
            className="h-12 md:h-16 lg:h-20 mx-auto"
          />
        </div>
        
        {/* Coming Soon */}
        <p className="text-[#39b54a] text-xl md:text-2xl font-bold tracking-widest mt-4">
          COMING SOON
        </p>
      </div>
    </div>
  );
}
