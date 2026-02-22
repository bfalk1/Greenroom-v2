import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Check if user exists in our DB (by ID first, then by email for seeded accounts)
      let user = await prisma.user.findUnique({
        where: { id: data.user.id },
      });

      if (!user && data.user.email) {
        // Check by email (handles seeded accounts where Prisma ID might differ from auth ID)
        user = await prisma.user.findUnique({
          where: { email: data.user.email },
        });
      }

      if (!user) {
        // First time — create user record
        user = await prisma.user.create({
          data: {
            id: data.user.id,
            email: data.user.email || "",
            profileCompleted: false,
            role: "USER",
            isActive: true,
          },
        });

        // Create credit balance
        await prisma.creditBalance.create({
          data: {
            userId: data.user.id,
            balance: 0,
          },
        });
      }

      // Redirect based on profile completion
      if (!user.profileCompleted) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }

      return NextResponse.redirect(`${origin}/marketplace`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
