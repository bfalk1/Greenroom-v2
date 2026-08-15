import { AppShell } from "@/components/layout/AppShell";
import { OutOfCreditsProvider } from "@/lib/context/OutOfCreditsContext";

// Force dynamic rendering - pages use auth/Supabase
export const dynamic = "force-dynamic";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OutOfCreditsProvider>
      <AppShell>{children}</AppShell>
    </OutOfCreditsProvider>
  );
}
