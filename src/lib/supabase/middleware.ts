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
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // For any authenticated request, load the account's status ONCE. Reused for
  // both suspension enforcement (immediately below) and the subscription
  // paywall further down, so we don't query the users table twice.
  let userData:
    | { subscription_status: string | null; role: string | null; is_active: boolean | null }
    | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("subscription_status, role, is_active")
      .eq("id", user.id)
      .single();
    userData = data;

    // Suspended accounts (is_active = false) are blocked everywhere except the
    // auth pages (so they can still sign out / read the notice) and health.
    // This is the real enforcement point — admin "suspend" also revokes the
    // Supabase session, but a still-valid cookie must not grant access.
    if (userData && userData.is_active === false) {
      const allowedWhileSuspended =
        pathname === "/login" ||
        pathname === "/signup" ||
        pathname === "/callback" ||
        pathname.startsWith("/api/health");

      if (!allowedWhileSuspended) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Account suspended" },
            { status: 403 }
          );
        }
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("error", "suspended");
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }
  }

  // Public paths — no auth required.
  // Sample reads are public per-endpoint via an ALLOWLIST (not a blanket
  // startsWith): only the catalog list, a single sample, and its preview. Any
  // other /api/samples/** sub-route (e.g. following) is NOT public by default,
  // so a future sub-route can't silently ship unauthenticated.
  const publicPaths = ["/", "/landing-preview", "/login", "/signup", "/callback", "/help", "/contact", "/terms", "/privacy", "/creator-terms", "/license", "/copyright", "/api/health"];
  const isPublicSamplePath =
    pathname === "/api/samples" ||
    /^\/api\/samples\/[^/]+$/.test(pathname) ||
    /^\/api\/samples\/[^/]+\/preview$/.test(pathname);
  const isPublicPath =
    publicPaths.includes(pathname) ||
    pathname.startsWith("/waitlist") ||
    pathname.startsWith("/api/waitlist") ||
    pathname.startsWith("/api/webhooks") ||
    isPublicSamplePath ||
    pathname.startsWith("/api/genres") ||
    pathname.startsWith("/api/search") ||
    pathname.startsWith("/artist/") ||
    pathname === "/api/invites/verify" ||
    pathname === "/api/beta-invites/verify";

  // If user is logged in and on login/signup, redirect to marketplace.
  // Must run BEFORE the isPublicPath early-return — /login and /signup are
  // public paths, so the early-return would otherwise leave logged-in users
  // staring at an auth form.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/marketplace";
    return NextResponse.redirect(url);
  }

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

  // Subscription paywall — users without active subscription are limited
  // Allow: pricing, account, onboarding, creator paths, admin/mod paths
  const paywallExemptPaths = ["/pricing", "/account", "/onboarding", "/explore"];
  const isPaywallExempt = 
    paywallExemptPaths.includes(pathname) ||
    pathname.startsWith("/creator/") ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/mod/");
  
  // Check subscription in DB for paywall routes (reuses the userData loaded above).
  if (user && !isPaywallExempt) {
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
