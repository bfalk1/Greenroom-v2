import { AppShell } from "@/components/layout/AppShell";

// Force dynamic rendering - pages use auth/Supabase
export const dynamic = "force-dynamic";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
