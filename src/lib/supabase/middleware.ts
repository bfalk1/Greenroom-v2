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
  const publicPaths = ["/", "/login", "/signup", "/callback", "/explore", "/sounds", "/pricing", "/help", "/contact", "/terms", "/privacy", "/api/health"];
  const isPublicPath = 
    publicPaths.includes(pathname) || 
    pathname.startsWith("/waitlist") ||
    pathname.startsWith("/api/waitlist") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/samples") ||
    pathname.startsWith("/api/genres") ||
    pathname.startsWith("/artist/") ||
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

  // Subscription paywall — users without active subscription are limited
  // Allow: pricing, account, onboarding, creator paths, admin/mod paths
  const paywallExemptPaths = ["/pricing", "/account", "/onboarding", "/explore"];
  const isPaywallExempt = 
    paywallExemptPaths.includes(pathname) ||
    pathname.startsWith("/creator/") ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/mod/");
  
  // Check subscription in DB for paywall routes
  if (user && !isPaywallExempt) {
    // Need to check subscription status
    const { data: userData } = await supabase
      .from("users")
      .select("subscription_status, role")
      .eq("id", user.id)
      .single();
    
    const hasActiveSubscription = 
      userData?.subscription_status === "active" || 
      userData?.subscription_status === "past_due" ||
      userData?.role === "CREATOR" ||
      userData?.role === "ADMIN" ||
      userData?.role === "MODERATOR";
    
    // Redirect non-subscribers to pricing
    if (!hasActiveSubscription) {
      // Allow marketplace in read-only mode (will show limited UI)
      // But block library, favorites, following, download, creator apply
      const subscriberOnlyPaths = ["/library", "/favorites", "/following", "/download", "/creator/apply"];
      const needsSubscription = subscriberOnlyPaths.some(p => pathname.startsWith(p));
      
      if (needsSubscription) {
        const url = request.nextUrl.clone();
        url.pathname = "/pricing";
        url.searchParams.set("redirect", pathname);
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
