import { Sidebar } from "@/components/layout/Sidebar";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { GlobalAudioPlayer } from "@/components/layout/GlobalAudioPlayer";
import { CommandPalette } from "@/components/layout/CommandPalette";

// Force dynamic rendering - pages use auth/Supabase
export const dynamic = "force-dynamic";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      {/* Desktop Sidebar (hidden on mobile) */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      
      {/* Mobile Header */}
      <MobileHeader />
      
      {/* Main Content Area */}
      <main className="md:ml-56 pb-24 min-h-screen">
        {children}
      </main>
      
      {/* Global Audio Player (desktop only for now) */}
      <div className="hidden md:block">
        <GlobalAudioPlayer />
      </div>
      
      {/* Command Palette */}
      <CommandPalette />
    </div>
  );
}
