import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  
  // Log for debugging API auth issues
  if (pathname.startsWith("/api/")) {
    console.log("[Middleware]", pathname, { userId: user?.id, authError: authError?.message });
  }

  // Public paths — no auth required
  const publicPaths = ["/", "/login", "/signup", "/callback", "/marketplace", "/pricing", "/help", "/contact", "/terms", "/privacy", "/api/health"];
  const isPublicPath = 
    publicPaths.includes(pathname) || 
    pathname.startsWith("/waitlist") ||
    pathname.startsWith("/api/waitlist") ||
    pathname.startsWith("/api/webhooks") ||
    pathname === "/api/invites/verify";

  if (isPublicPath) {
    return supabaseResponse;
  }

  // API routes should return 401, not redirect
  if (pathname.startsWith("/api/") && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Protected routes — redirect to login if not authenticated
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If user is logged in and on login/signup, redirect to marketplace
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/marketplace";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
