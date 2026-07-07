import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// Server-side role gate for /mod/*. Middleware only handles auth/suspension;
// without this, any logged-in user could render the (empty) mod shell.
export default async function ModLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (!dbUser || (dbUser.role !== "MODERATOR" && dbUser.role !== "ADMIN")) {
    redirect("/");
  }

  return <>{children}</>;
}
