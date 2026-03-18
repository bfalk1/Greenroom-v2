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

      {/* Content - centered vertically */}
      <div className="relative z-10 text-center w-full flex flex-col items-center justify-center">
        {/* Black bar with logo */}
        <div className="bg-black py-6 md:py-8 px-8 w-full">
          <img
            src="/greenroom-2-logo.png"
            alt="GREENROOM 2.0"
            className="h-8 md:h-10 lg:h-12 mx-auto"
          />
        </div>
        
        {/* Coming Soon */}
        <img
          src="/coming-soon.png"
          alt="COMING SOON"
          className="h-10 md:h-14 lg:h-16 mx-auto mt-4"
        />
      </div>
    </div>
  );
}
