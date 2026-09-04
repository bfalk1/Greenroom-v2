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

  // Meta ad click-id (fbclid) capture. fbc's only browser source is the _fbc
  // cookie that fbevents.js mints from the fbclid on landing — which is never
  // written when that script is blocked (ad blockers / Safari ITP / Brave) or
  // when a redirect strips fbclid before the pixel runs, i.e. exactly the
  // cohort the Conversions API exists to recover. Persisting the click id
  // first-party lets capiAttributionFromRequest still populate fbc for them.
  // Meta's format is fb.1.<first-seen-ms>.<fbclid>. A NEW fbclid overwrites a
  // stale gr_fbc — Meta attributes to the latest click, and fbevents refreshes
  // its own _fbc the same way — while a repeat sighting of the SAME id keeps
  // the original click time. An existing _fbc is authoritative (it's read
  // first at capture), so gr_fbc never shadows it.
  // httpOnly is safe (only the server reads gr_fbc, unlike _fbc which fbevents
  // reads); the strict charset guards against a junk/oversized cookie value.
  // The Set-Cookie must ride EVERY response branch below (withAdCookies) — when it
  // rode only the fall-through supabaseResponse, each redirect return silently
  // dropped the click id, most damagingly the protected-route bounce to
  // /login, which buries fbclid inside the ?redirect param where no later
  // request re-reads it.
  const fbclid = request.nextUrl.searchParams.get("fbclid");
  let grFbc: string | null = null;
  // Only a WELL-FORMED _fbc suppresses the first-party copy — capture rejects
  // malformed ones (normalizeFbc), so deferring to a mangled cookie would
  // lose the click id entirely. The shape mirrors FBC_FORMAT in
  // metaCapiServer.ts, not imported because that module pulls node:crypto,
  // which this edge-runtime middleware can't load.
  const fbcCookie = request.cookies.get("_fbc")?.value ?? "";
  const hasAuthoritativeFbc = /^fb\.\d+\.\d+\.\S{1,400}$/.test(fbcCookie);
  if (
    fbclid &&
    /^[A-Za-z0-9_-]{1,255}$/.test(fbclid) &&
    !hasAuthoritativeFbc
  ) {
    const existing = request.cookies.get("gr_fbc")?.value;
    if (!existing || !existing.endsWith(`.${fbclid}`)) {
      grFbc = `fb.1.${Date.now()}.${fbclid}`;
    }
  }
  // TikTok's ad click id, given the same first-party treatment as fbclid — and
  // for a sharper reason. TikTok ad traffic arrives in TikTok's in-app browser,
  // and when the payment redirect hands off to the system browser the
  // _ttp/ttclid cookies do NOT follow, so activation sees no click id at all
  // and the conversion can only ever be matched by email, never credited to
  // the click that paid for it. events.js writes its own `ttclid` cookie raw,
  // with no timestamp; stamping first-sight time here is what later lets
  // /api/user/me tell a fresh click from a stale one in a second browser's jar.
  // Same overwrite rule as gr_fbc: a NEW id wins, a repeat sighting of the same
  // id keeps its original stamp.
  const ttclid = request.nextUrl.searchParams.get("ttclid");
  let grTtclid: string | null = null;
  // Charset admits dots — a real TikTok click id looks like "E.C.P.xxxxx", so
  // gr_fbc's dot-free rule would reject every one of them.
  if (ttclid && /^[A-Za-z0-9._-]{1,255}$/.test(ttclid)) {
    const existing = request.cookies.get("gr_ttclid")?.value;
    if (!existing || !existing.endsWith(`.${ttclid}`)) {
      grTtclid = `tt.1.${Date.now()}.${ttclid}`;
    }
  }

  const withAdCookies = <T extends NextResponse>(res: T): T => {
    if (grFbc) {
      res.cookies.set("gr_fbc", grFbc, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 90, // 90 days, matching Meta's _fbc TTL
      });
    }
    if (grTtclid) {
      res.cookies.set("gr_ttclid", grTtclid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        // 30 days: TikTok's own ttclid cookie lives about that long and its
        // longest click-attribution window is 28, so a longer lease would
        // bank ids that can no longer win attribution.
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });
    }
    return res;
  };

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
          return withAdCookies(
            NextResponse.json({ error: "Account suspended" }, { status: 403 })
          );
        }
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("error", "suspended");
        return withAdCookies(NextResponse.redirect(url));
      }
      return withAdCookies(supabaseResponse);
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
  // /checkout (exact — NOT /checkout/complete) is public so an anonymous buyer
  // keeps the tier they picked and signs up inline on the page; the checkout
  // APIs it calls all still require a session.
  // NOTE: "/explore" and "/waitlist" are REMOVED routes kept in this allowlist
  // on purpose — they let the deleted paths fall through to Next's 404 for
  // everyone instead of the auth gate bouncing anonymous visitors to /login
  // (a hard 404, not a redirect).
  const publicPaths = ["/", "/login", "/signup", "/callback", "/pricing", "/checkout", "/vip", "/promo", "/promo/pricing", "/help", "/contact", "/terms", "/privacy", "/creator-terms", "/license", "/copyright", "/api/health", "/explore", "/waitlist"];
  const isPublicSamplePath =
    pathname === "/api/samples" ||
    /^\/api\/samples\/[^/]+$/.test(pathname) ||
    /^\/api\/samples\/[^/]+\/preview$/.test(pathname);
  const isPublicPath =
    publicPaths.includes(pathname) ||
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
    // Landing page's "Verified creators" row — resolves the curated lineup to
    // real avatars. Read-only, returns only public creator display data.
    pathname === "/api/landing/creators" ||
    pathname.startsWith("/api/genres") ||
    // Read-only filter options (published-sample metadata) used by the public
    // /explore browse page. GET only — the route also exports an admin-only
    // PUT (seed defaults) that must stay behind auth.
    (request.method === "GET" && pathname.startsWith("/api/instruments")) ||
    pathname.startsWith("/api/search") ||
    pathname === "/api/invites/verify" ||
    pathname === "/api/beta-invites/verify" ||
    // Referral banner on the (public) signup page — rate-limited, returns
    // only a display name, never the referrer's email or id.
    pathname === "/api/referral/verify" ||
    // VIP offer password gate — unauthenticated by design (a shared marketing
    // code, not account auth); the route rate-limits and the unlock is an
    // HMAC-signed cookie the checkout routes verify server-side.
    pathname.startsWith("/api/vip-offer") ||
    // DEV-ONLY: landing-page preview proxy that forwards the public prod catalog
    // so localhost auditions real sounds. The route itself 404s in production.
    (process.env.NODE_ENV !== "production" &&
      pathname === "/api/dev/landing-preview");

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
    return withAdCookies(NextResponse.redirect(new URL(dest, request.url)));
  }

  // Hard paywall on account creation: a bare, logged-out hit on /signup is a
  // consumer trying to make a free account, which must instead go through the
  // paywall — pricing -> public /checkout, where the signup form is rendered
  // inline at the point of subscribing. The standalone form is still served
  // ONLY for invite-gated entries: creator and beta invites (?invite / ?beta),
  // which is the "keep a signup path for creators" carve-out. A referral (?ref)
  // is forwarded to /pricing so its attribution isn't lost. ?redirect is NOT a
  // pass: the middleware bounces protected routes to /login?redirect=…, which
  // the login page propagates to /signup?redirect=… — honoring it here would
  // silently reopen the free-signup path. The VIP discount rides an HMAC cookie,
  // not a URL param, so routing these to /pricing loses nothing.
  // Must run BEFORE the isPublicPath early-return (/signup is a public path).
  if (!user && pathname === "/signup") {
    const params = request.nextUrl.searchParams;
    const isInviteSignup = params.has("invite") || params.has("beta");
    if (!isInviteSignup) {
      const url = request.nextUrl.clone();
      url.pathname = "/pricing";
      url.search = "";
      const ref = params.get("ref");
      if (ref) url.searchParams.set("ref", ref);
      // Carry the ad click ids so each pixel on /pricing still mints its
      // attribution cookie (_fbc / _ttp). gr_fbc above already backstops the
      // CAPI side for this hop; TikTok has no server channel, so forwarding
      // ttclid here is the ONLY thing keeping a TikTok ad click that lands on
      // /signup attributable.
      if (fbclid) url.searchParams.set("fbclid", fbclid);
      if (ttclid) url.searchParams.set("ttclid", ttclid);
      return withAdCookies(NextResponse.redirect(url));
    }
  }

  if (isPublicPath) {
    return withAdCookies(supabaseResponse);
  }

  // API routes should return 401, not redirect
  if (pathname.startsWith("/api/") && !user) {
    return withAdCookies(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
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
    return withAdCookies(NextResponse.redirect(url));
  }

  // Subscription paywall — users without active subscription are limited
  // Allow: pricing, account, onboarding, creator paths, admin/mod paths
  const paywallExemptPaths = ["/pricing", "/account", "/onboarding"];
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
        return withAdCookies(NextResponse.redirect(url));
      }
    }
  }

  return withAdCookies(supabaseResponse);
}
