import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/safeRedirect";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
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
  // /explore and /pricing are public so the landing page's "Browse samples"
  // and pricing links work for anonymous visitors; both pages already render
  // a logged-out variant (signup CTAs) and their write actions require auth.
  const publicPaths = ["/", "/landing-preview", "/login", "/signup", "/callback", "/explore", "/pricing", "/vip", "/help", "/contact", "/terms", "/privacy", "/creator-terms", "/license", "/copyright", "/api/health"];
  const isPublicSamplePath =
    pathname === "/api/samples" ||
    /^\/api\/samples\/[^/]+$/.test(pathname) ||
    /^\/api\/samples\/[^/]+\/preview$/.test(pathname);
  const isPublicPath =
    publicPaths.includes(pathname) ||
    pathname.startsWith("/waitlist") ||
    pathname.startsWith("/api/waitlist") ||
    pathname.startsWith("/api/webhooks") ||
    // Vercel cron invokes these with a Bearer CRON_SECRET header and no
    // session cookie. Each cron route verifies the secret itself and fails
    // closed when it's unset — session auth here would block every run.
    pathname.startsWith("/api/cron") ||
    // Health/preflight endpoints authenticate with CRON_SECRET themselves
    // (fail closed when unset) — session auth would block post-deploy checks.
    pathname.startsWith("/api/health") ||
    // PayPal redirects the buyer here after approval. Deliberately public:
    // the grant is keyed to the stored order row / subscription custom_id
    // (not the session), so a missing cookie must not strand a paid order.
    pathname === "/api/credits/purchase-paypal/return" ||
    pathname === "/api/subscription/checkout-paypal/return" ||
    isPublicSamplePath ||
    pathname.startsWith("/api/genres") ||
    // Read-only filter options (published-sample metadata) used by the public
    // /explore browse page. GET only — the route also exports an admin-only
    // PUT (seed defaults) that must stay behind auth.
    (request.method === "GET" && pathname.startsWith("/api/instruments")) ||
    pathname.startsWith("/api/search") ||
    pathname.startsWith("/artist/") ||
    pathname === "/api/invites/verify" ||
    pathname === "/api/beta-invites/verify" ||
    // Referral banner on the (public) signup page — rate-limited, returns
    // only a display name, never the referrer's email or id.
    pathname === "/api/referral/verify" ||
    // VIP offer password gate — unauthenticated by design (a shared marketing
    // code, not account auth); the route rate-limits and the unlock is an
    // HMAC-signed cookie the checkout routes verify server-side.
    pathname.startsWith("/api/vip-offer");

  // If user is logged in and on login/signup, forward them along. A carried
  // ?redirect (e.g. the /vip lifetime flow's /checkout deep link) wins over
  // the default /marketplace — dropping it here silently strands a buyer who
  // signed in from another tab mid-purchase. Must run BEFORE the isPublicPath
  // early-return — /login and /signup are public paths, so the early-return
  // would otherwise leave logged-in users staring at an auth form.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const carried = safeRedirectPath(
      request.nextUrl.searchParams.get("redirect")
    );
    // An auth-page target would redirect straight back here — infinite loop.
    const dest =
      carried && !carried.startsWith("/login") && !carried.startsWith("/signup")
        ? carried
        : "/marketplace";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (isPublicPath) {
    return supabaseResponse;
  }

  // API routes should return 401, not redirect
  if (pathname.startsWith("/api/") && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Protected routes — redirect to login if not authenticated, carrying the
  // full target (path + query) as ?redirect so login/signup can land the
  // visitor back where they were headed. Critical for the VIP flow: a shared
  // /checkout?tier=VIP&lifetime=1 link must survive the auth round-trip, not
  // dump the buyer on a bare login form that forgets why they came.
  if (!user) {
    const url = request.nextUrl.clone();
    const target = pathname + (request.nextUrl.search || "");
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("redirect", target);
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
