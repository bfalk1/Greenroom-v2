# GREENROOM — Statement of Work

> **Music Sample Marketplace** · Full-Stack Rebuild  
> Client: GREENROOM · Developer: Benjamin Falkner  
> Budget: $16,000 CAD ($4,000 × 4 milestones)  
> Stack: Next.js 14 (App Router) · Vercel · Supabase · Prisma · Stripe

---

## Tech Stack

### Core Framework
| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14 (App Router) | React framework with SSR, API routes, file-based routing |
| **Language** | TypeScript | Type safety across frontend + backend |
| **Styling** | Tailwind CSS + shadcn/ui | Utility-first CSS, pre-built dark theme components |
| **State** | React Server Components + TanStack Query | Server-first rendering, client-side cache for interactive data |
| **Hosting** | Vercel | Edge network, serverless functions, preview deploys, cron jobs |

### Backend & Data
| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Database** | Supabase Postgres | Managed Postgres with connection pooling, extensions, backups |
| **ORM** | Prisma | Type-safe queries, schema migrations, transaction support |
| **File Storage** | Supabase Storage | Private buckets (WAV files), public CDN (previews, covers, avatars) |
| **Search** | Postgres Full-Text Search | `tsvector` + GIN indexes — no external search service needed for V1 |
| **Cron Jobs** | Vercel Cron | Monthly payout calculations, scheduled maintenance tasks |

### Authentication & Security
| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Auth Provider** | Supabase Auth (GoTrue) | Email/password + Google OAuth, session management |
| **Session Strategy** | Cookie-based SSR sessions | `@supabase/ssr` — secure, httpOnly cookies, works with server components |
| **Role System** | Custom middleware | 4 roles: USER → CREATOR → MODERATOR → ADMIN, enforced on every route |
| **Row Level Security** | Supabase RLS | Defense-in-depth — DB-level access policies as safety net behind Prisma |
| **API Protection** | Route middleware + Supabase Auth | Every API route verifies session token before processing |
| **File Protection** | Signed URLs (60s expiry) | Private bucket files only accessible via time-limited signed URLs |
| **Webhook Security** | Stripe signature verification | Every incoming webhook verified against Stripe signing secret |

### Payments & Commerce
| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Subscriptions** | Stripe Checkout + Billing | PCI-compliant subscription management, 3 tiers |
| **Customer Portal** | Stripe Customer Portal | Self-service upgrade, downgrade, cancel — no custom billing UI needed |
| **Creator Payouts** | Stripe Connect (Express) | Handles identity verification, international payouts, tax forms (1099) |
| **Credit Ledger** | Custom (Prisma + Postgres) | `CreditTransaction` table — full audit trail of every credit movement |

### Audio & Media
| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Audio Player** | wavesurfer.js | Waveform visualization, play/pause, progress — no download exposed |
| **Preview Streaming** | Supabase Storage CDN (public) | Compressed MP3 previews served from edge, <1s play start |
| **Full Downloads** | Supabase Storage (private) | WAV files via signed URLs, purchase verification required |
| **Audio Processing** | Supabase Edge Function (ffmpeg/WASM) | Server-side WAV validation, duration extraction, preview generation |

### DevOps & Monitoring
| Layer | Technology | Purpose |
|-------|-----------|---------|
| **CI/CD** | Vercel Git Integration | Auto-deploy on push, preview deploys for PRs |
| **Testing** | Vitest + Playwright | Unit tests (business logic), E2E tests (critical flows) |
| **Error Tracking** | Vercel Analytics / Sentry | Runtime error monitoring, performance metrics |
| **Health Checks** | Custom `/api/health` endpoint | DB connectivity verification, uptime monitoring |

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    Vercel (Edge + Serverless)              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Next.js 14   │  │  API Routes  │  │  Stripe        │  │
│  │  App Router   │  │  /api/*      │  │  Webhooks      │  │
│  │  (SSR + RSC)  │  │  (Prisma)    │  │  (verified)    │  │
│  └──────┬────────┘  └──────┬───────┘  └───────┬────────┘  │
└─────────┼──────────────────┼──────────────────┼────────────┘
          │                  │                  │
   ┌──────▼──────┐    ┌─────▼──────┐    ┌──────▼──────┐
   │  Supabase   │    │  Supabase  │    │   Stripe    │
   │  Auth       │    │  Postgres  │    │   API       │
   │  (GoTrue)   │    │  (Prisma)  │    │  Checkout   │
   │  Email+OAuth│    │  FTS+GIN   │    │  Connect    │
   └─────────────┘    └────────────┘    └─────────────┘

   ┌──────────────────────────────┐
   │  Supabase Storage            │
   │  📁 samples/  (private)      │
   │  📁 previews/ (public CDN)   │
   │  📁 covers/   (public CDN)   │
   │  📁 avatars/  (public CDN)   │
   │  📁 applications/ (private)  │
   └──────────────────────────────┘
```

---

## Priority Matrix

Ranked by business impact and user trust. These guide every technical decision.

### 🔴 P0 — Non-Negotiable (Must be rock-solid at launch)

| Priority | Why It Matters |
|----------|---------------|
| **Payment Security** | Stripe handles PCI compliance, but webhook verification, idempotent handlers, and atomic credit transactions must be bulletproof. One double-charge or lost credit = lost trust. |
| **Audio File Protection (DRM-light)** | Full WAV files must NEVER be publicly accessible. Signed URLs with short expiry (60s), no direct download links exposed, purchase verification before every download. This is the entire business model. |
| **Auth & Access Control** | Role-based middleware on every route. Users can't access creator tools, creators can't access mod/admin. Session management via Supabase Auth with cookie-based SSR sessions. |
| **Atomic Credit Transactions** | Purchase = deduct credits + create purchase record + log transaction — all in one Prisma `$transaction`. No race conditions, no double-spend, no partial state. |
| **Data Integrity** | Foreign keys, unique constraints, cascading deletes where appropriate. Credit balance can never go negative. Every credit movement logged in `CreditTransaction` ledger. |

### 🟡 P1 — Critical for Good UX (Must be solid at launch)

| Priority | Why It Matters |
|----------|---------------|
| **Audio Streaming Speed** | Preview files served from Supabase public CDN. Compressed MP3 previews (not full WAV) for streaming. Play button should start audio within <1 second. |
| **Download Speed** | Full WAV downloads via signed URLs direct from Supabase Storage (not proxied through Vercel). Users expect large audio files to download fast. |
| **Search Performance** | Postgres full-text search with `tsvector` + GIN indexes. Must handle 10K+ samples without lag. Filters (genre, key, BPM, type) are indexed columns. |
| **Page Load Speed** | Server-side rendering where possible, lazy load heavy components (waveform player, charts). Target <2s initial load. Vercel Edge + CDN for static assets. |
| **Subscription Lifecycle** | Upgrades, downgrades, cancellations, failed payments — all handled gracefully via Stripe webhooks. User always sees accurate subscription status and credit balance. |
| **Mobile Handling** | Desktop-only for V1. Clean mobile gate page — not a broken layout. Mobile users see a branded "coming soon" page, not a mangled marketplace. |

### 🟢 P2 — Important for Growth (Solid but can iterate post-launch)

| Priority | Why It Matters |
|----------|---------------|
| **Creator Payout Accuracy** | Monthly calculation must correctly sum credits spent per creator. $50 minimum threshold. Stripe Connect transfers. Can be semi-manual for V1 (admin triggers). |
| **Moderation Workflow** | Application review, sample review, deactivation. Must work but UI polish is secondary. Functional > pretty for internal tools. |
| **Analytics Dashboard** | Admin needs to see KPIs (users, revenue, samples, purchases). Queries must be correct. Real-time charts are nice-to-have — daily refresh is fine for V1. |
| **SEO & Open Graph** | Sample and creator pages need proper meta tags for sharing. Not critical for launch day but important for organic growth. |
| **Email Notifications** | Welcome, application approved/denied, payout received. Nice-to-have for V1. Can use Supabase Auth emails for basics. |

### ⚪ P3 — Future Iterations (Post-launch roadmap)

| Priority | Notes |
|----------|-------|
| **Mobile App / Responsive** | V1 is desktop-only. Mobile experience is a separate project. |
| **Advanced Search (Meilisearch/Typesense)** | Postgres FTS is sufficient for 10K samples. Migrate later if needed. |
| **Real-time Notifications** | In-app notifications for new samples from followed creators, etc. |
| **Social Features** | Comments, playlists, sharing, collaborative collections. |
| **AI-powered Recommendations** | "Similar samples", personalized homepage. |
| **Referral / Affiliate System** | Creator referral codes, discount campaigns. |

---

## Milestones

### Milestone 1 — Foundation + Subscriptions ($4,000)

**Deliverable:** Working app with authentication, subscriptions, and credit system.

| Feature | Details |
|---------|---------|
| Project scaffolding | Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Prisma, Supabase |
| Database | Full schema migration from ERD, seed script for subscription tiers |
| Authentication | Email/password + Google OAuth via Supabase Auth |
| Profile completion | Mandatory onboarding flow (first login redirect) |
| Role-based access | Middleware gating: USER, CREATOR, MODERATOR, ADMIN |
| Stripe subscriptions | 3 tiers (GA $10.99/100cr, VIP $18.99/200cr, AA $34.99/500cr) |
| Checkout flow | Stripe Checkout → webhook → credit issuance |
| Subscription management | Upgrade, downgrade, cancel via Stripe Customer Portal |
| Credit system | Balance display, transaction ledger, rollover logic |
| Layout | Dark theme shell, responsive nav, credit badge |

**Acceptance Criteria:**
- [ ] User can sign up, complete profile, and log in
- [ ] User can subscribe to any tier and receive credits
- [ ] Credit balance displays correctly in nav
- [ ] Upgrade mid-cycle issues bonus credits
- [ ] Cancellation handled gracefully (keeps credits, stops renewal)
- [ ] Role-based routes are enforced (unauthorized = redirect)

---

### Milestone 2 — Samples + Marketplace ($4,000)

**Deliverable:** Creators can upload samples. Users can browse, search, filter, and stream previews.

| Feature | Details |
|---------|---------|
| Storage setup | Supabase buckets: samples (private), previews (public), covers (public) |
| Sample upload | WAV validation, metadata form (genre, key, BPM, type, tags, credit price) |
| Preview generation | Auto-generate compressed preview from uploaded WAV |
| Audio player | Custom player with waveform (wavesurfer.js), play/pause, progress — no download |
| Marketplace homepage | Featured/new/popular samples |
| Search | Full-text search across name, tags, creator name |
| Filters | Genre, instrument type, key, BPM range, sample type |
| Sorting | Newest, most popular, highest rated |
| Pagination | Cursor-based infinite scroll |
| Creator profiles | Public pages with bio, samples, stats |

**Acceptance Criteria:**
- [ ] Creator can upload a WAV file with metadata
- [ ] Preview auto-generates and is streamable
- [ ] Full WAV is NOT publicly accessible
- [ ] Marketplace loads with search, filter, sort working
- [ ] Audio player streams previews with <1s start time
- [ ] Creator profile page displays their samples

---

### Milestone 3 — Purchases + Creator Economy ($4,000)

**Deliverable:** Complete purchase flow, user library, creator applications, dashboard, and payout system.

| Feature | Details |
|---------|---------|
| Purchase flow | Atomic credit deduction, purchase record, transaction log |
| Download | Signed URL generation, purchase verification, unlimited re-downloads |
| User library | All purchased samples with download buttons |
| Ratings | 1-5 stars per sample, average calculation |
| Favorites | Toggle favorite, favorites page |
| Follows | Follow/unfollow creators, feed of new samples |
| Creator application | Form with artist info, social links, sample ZIP upload |
| Creator dashboard | Sample management, upload stats, analytics overview |
| Creator earnings | Payout history, estimated earnings |
| Stripe Connect | Express account onboarding for creators |
| Monthly payouts | Cron job calculation, $50 threshold, Stripe transfers |

**Acceptance Criteria:**
- [ ] User can purchase a sample and credits deduct atomically
- [ ] User can download purchased samples (even if later deactivated)
- [ ] Insufficient credits = graceful error (no partial deduction)
- [ ] Rating updates sample's average correctly
- [ ] Creator can apply, get approved, upload samples, see earnings
- [ ] Payout calculation sums correctly per creator

---

### Milestone 4 — Admin + Polish + Launch ($4,000)

**Deliverable:** Production-ready application with moderation, admin tools, and deployment.

| Feature | Details |
|---------|---------|
| Moderation dashboard | Application review queue, sample review, deactivation |
| Audit log | All mod/admin actions tracked and viewable |
| Admin dashboard | 30-day analytics (users, revenue, samples, purchases) |
| User management | Search, role changes, account deactivation, credit adjustments |
| CSV exports | Users, transactions, samples, payouts |
| Payout management | View all, retry failed, manual trigger |
| Mobile gate | Desktop-only redirect with branded landing page |
| SEO | Meta tags, Open Graph for sample/creator pages |
| Error handling | Error boundaries, loading states, toast notifications |
| Legal pages | Terms of Service, Privacy Policy (static) |
| Testing | Unit tests (credits, purchases), E2E tests (critical flows) |
| Deployment | Staging environment, production deploy, monitoring, health checks |

**Acceptance Criteria:**
- [ ] Moderator can review and approve/deny creator applications
- [ ] Moderator can deactivate samples (removed from marketplace, stays in libraries)
- [ ] Admin can view analytics, manage users, adjust credits
- [ ] CSV exports download correctly
- [ ] Mobile users see clean gate page
- [ ] App deployed to production with custom domain
- [ ] Health check endpoint returns status
- [ ] No critical bugs in core flows

---

## Technical Security Checklist

Applied across all milestones:

- [ ] Stripe webhook signature verification on every webhook endpoint
- [ ] Supabase RLS policies as defense-in-depth layer
- [ ] No raw SQL injection vectors (Prisma parameterized queries)
- [ ] Auth middleware on every protected API route
- [ ] Credit operations always inside `$transaction`
- [ ] Signed URLs expire in 60 seconds for private files
- [ ] No `Content-Disposition: attachment` on preview streams
- [ ] Rate limiting on auth endpoints (Supabase built-in + custom)
- [ ] Environment variables never exposed to client (only `NEXT_PUBLIC_*`)
- [ ] CORS configured for production domain only
- [ ] Cron endpoints protected with secret token
- [ ] File upload validation: type, size, format (server-side, not just client)

---

## Payment Schedule

| Milestone | Payment | Trigger |
|-----------|---------|---------|
| 1 — Foundation + Subscriptions | $4,000 | Acceptance criteria met + client sign-off |
| 2 — Samples + Marketplace | $4,000 | Acceptance criteria met + client sign-off |
| 3 — Purchases + Creator Economy | $4,000 | Acceptance criteria met + client sign-off |
| 4 — Admin + Polish + Launch | $4,000 | Acceptance criteria met + client sign-off |
| **Total** | **$16,000** | |

---

## Timeline Estimate

| Milestone | Estimated Duration | Phases Covered |
|-----------|--------------------|----------------|
| 1 | 2-3 weeks | Phases 1-2 |
| 2 | 3-4 weeks | Phases 3-4 |
| 3 | 3-4 weeks | Phases 5-6 |
| 4 | 3-4 weeks | Phases 7-10 |
| **Total** | **~12-15 weeks** | |

> Buffer included. Actual pace depends on feedback cycles and scope changes.

---

*GREENROOM SOW v1.0 — Ready for client review*
