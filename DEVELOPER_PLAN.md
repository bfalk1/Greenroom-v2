# GREENROOM — Developer Implementation Plan

> **Music Sample Marketplace** · Subscription-based credit system  
> Stack: Next.js 14 (App Router) · Vercel · Supabase (Postgres) · Prisma · Stripe  
> Last updated: 2025-07-09

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 1 — Project Scaffolding & Auth (Days 1–5)](#phase-1--project-scaffolding--auth-days-15)
3. [Phase 2 — Subscriptions & Credit System (Days 6–11)](#phase-2--subscriptions--credit-system-days-611)
4. [Phase 3 — Sample Upload, Storage & Streaming (Days 12–19)](#phase-3--sample-upload-storage--streaming-days-1219)
5. [Phase 4 — Marketplace Browse, Search & Filtering (Days 20–26)](#phase-4--marketplace-browse-search--filtering-days-2026)
6. [Phase 5 — Purchases, Library & Engagement (Days 27–33)](#phase-5--purchases-library--engagement-days-2733)
7. [Phase 6 — Creator System & Payouts (Days 34–42)](#phase-6--creator-system--payouts-days-3442)
8. [Phase 7 — Moderation Dashboard (Days 43–49)](#phase-7--moderation-dashboard-days-4349)
9. [Phase 8 — Admin Dashboard & Analytics (Days 50–57)](#phase-8--admin-dashboard--analytics-days-5057)
10. [Phase 9 — Polish, Mobile Gate & Dark Theme (Days 58–62)](#phase-9--polish-mobile-gate--dark-theme-days-5862)
11. [Phase 10 — Testing, QA & Deployment (Days 63–70)](#phase-10--testing-qa--deployment-days-6370)
12. [Environment Variables Reference](#environment-variables-reference)
13. [Database Seeding Strategy](#database-seeding-strategy)
14. [Risk Register](#risk-register)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Vercel (Edge + Serverless)           │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Next.js App │  │ API Routes   │  │ Stripe        │  │
│  │  (App Router)│  │ /api/*       │  │ Webhooks      │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
└─────────┼────────────────┼──────────────────┼───────────┘
          │                │                  │
    ┌─────▼─────┐   ┌─────▼──────┐    ┌─────▼──────┐
    │ Supabase  │   │ Supabase   │    │  Stripe    │
    │ Auth      │   │ Postgres   │    │  API       │
    │ (GoTrue)  │   │ (via Prisma│    │  (Sub +    │
    └───────────┘   └────────────┘    │   Connect) │
                                      └────────────┘
    ┌─────────────────────────┐
    │ Supabase Storage        │
    │ • samples (private)     │
    │ • previews (public)     │
    │ • avatars (public)      │
    │ • applications (private)│
    └─────────────────────────┘
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth | Supabase Auth (email + OAuth) | Native Postgres integration, RLS support, free tier |
| ORM | Prisma | Type-safe queries, migrations, schema already defined |
| File Storage | Supabase Storage | Same infra as DB, signed URLs for private files, CDN for public |
| Audio Streaming | Signed URL → HTML5 `<audio>` with DRM-light | Supabase signed URLs expire; no direct download link exposed |
| Payments | Stripe Checkout + Customer Portal | PCI compliance offloaded, subscription management built-in |
| Creator Payouts | Stripe Connect (Express) | Handles 1099s, international payouts, identity verification |
| Search | Postgres `tsvector` + `GIN` index | Good enough for Phase 1; switch to Typesense/Meilisearch later if needed |
| Styling | Tailwind CSS + shadcn/ui | Dark theme native, consistent components, fast dev |
| State Management | React Server Components + SWR/TanStack Query for client | Minimize client bundle, server-first approach |

---

## Phase 1 — Project Scaffolding & Auth (Days 1–5)

### What Gets Built
- Next.js project with App Router, TypeScript, Tailwind, shadcn/ui
- Prisma setup with Supabase Postgres connection
- Database migration from schema
- Supabase Auth integration (email/password + Google OAuth)
- Mandatory profile completion flow (first login redirect)
- Role-based middleware (USER, CREATOR, MODERATOR, ADMIN)
- Base layout: dark theme shell, nav bar, responsive gate

### Technical Implementation Notes

**Project Init:**
```bash
npx create-next-app@latest greenroom --typescript --tailwind --eslint --app --src-dir
npx prisma init
npx shadcn-ui@latest init  # dark theme preset
```

**Auth Flow:**
1. Use `@supabase/ssr` for server-side auth (cookie-based sessions)
2. Create Supabase client utilities: `createServerClient()` and `createBrowserClient()`
3. Middleware (`middleware.ts`) checks auth on every route:
   - Unauthenticated → redirect to `/login`
   - Authenticated but `profileCompleted === false` → redirect to `/onboarding`
   - Role-gated routes: `/creator/*` requires CREATOR, `/mod/*` requires MODERATOR, `/admin/*` requires ADMIN
4. On Supabase Auth signup, create a `User` record via a Postgres trigger OR a post-signup API call

**Profile Completion:**
- `/onboarding` page: collects `fullName`, `username`, address fields
- On submit → updates `User` record, sets `profileCompleted = true`
- Middleware blocks all other routes until complete

**Database Trigger (recommended approach for user sync):**
```sql
-- Supabase SQL Editor: sync auth.users → public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, username, profile_completed)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'username',
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/callback` | Supabase OAuth callback handler |
| PUT | `/api/user/profile` | Complete/update profile |
| GET | `/api/user/me` | Get current user with role, balance, subscription |

### Dependencies & Blockers
- Supabase project must be created (get connection string, anon key, service role key)
- Domain/subdomain decided for Vercel deployment
- Google OAuth credentials (if using Google login)

### Estimated Effort: **5 days**

**Day 1:** Project scaffolding, Prisma setup, run initial migration  
**Day 2:** Supabase Auth integration, login/signup pages  
**Day 3:** User sync trigger, middleware for auth + role gating  
**Day 4:** Onboarding/profile completion flow  
**Day 5:** Base layout (dark theme shell, nav bar), test auth end-to-end

---

## Phase 2 — Subscriptions & Credit System (Days 6–11)

### What Gets Built
- Stripe product/price setup for 3 tiers (GA, VIP, AA)
- Subscription checkout flow via Stripe Checkout
- Stripe webhook handler for subscription lifecycle events
- Credit issuance on subscription creation and renewal
- Credit balance display in nav
- Subscription management (upgrade, downgrade, cancel) via Stripe Customer Portal
- Credit rollover logic (credits persist across billing cycles)
- `CreditTransaction` ledger for full audit trail

### Technical Implementation Notes

**Stripe Setup:**
1. Create 3 Products in Stripe Dashboard (or via API):
   - GA: $10.99/mo → 100 credits
   - VIP: $18.99/mo → 200 credits  
   - AA: $34.99/mo → 500 credits
2. Store `stripePriceId` in `SubscriptionTier` table
3. Seed tiers into DB as part of migration/seed script

**Checkout Flow:**
1. User clicks "Subscribe" → API creates Stripe Checkout Session
2. `success_url` → `/subscription/success?session_id={CHECKOUT_SESSION_ID}`
3. Success page verifies session and shows confirmation
4. **Actual subscription creation happens via webhook** (not on success page)

**Webhook Events to Handle:**
| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create `Subscription`, `CreditBalance`, issue initial credits, log `CreditTransaction` |
| `invoice.paid` | Issue monthly credits (renewal), update `currentPeriodStart/End` |
| `customer.subscription.updated` | Handle upgrade/downgrade: on upgrade mid-cycle, issue difference credits as `UPGRADE_TOPUP` |
| `customer.subscription.deleted` | Set status to `CANCELED` |
| `invoice.payment_failed` | Set status to `PAST_DUE` |

**Credit Rollover:** Credits simply accumulate. The `CreditBalance.balance` is an absolute number. On each renewal, add the tier's `creditsPerMonth` to existing balance. No expiry logic needed.

**Upgrade Mid-Cycle Top-Up:**
```typescript
// When upgrading from GA (100) to VIP (200) mid-cycle:
// 1. Stripe handles prorated billing
// 2. We issue the difference: 200 - 100 = 100 bonus credits
// 3. Log as UPGRADE_TOPUP transaction
const topUp = newTier.creditsPerMonth - oldTier.creditsPerMonth;
if (topUp > 0) {
  await prisma.creditBalance.update({
    where: { userId },
    data: { balance: { increment: topUp } }
  });
  await prisma.creditTransaction.create({
    data: { userId, amount: topUp, type: 'UPGRADE_TOPUP', note: `Upgraded from ${oldTier.name} to ${newTier.name}` }
  });
}
```

**Stripe Customer Portal:**
- Configure in Stripe Dashboard: allow plan changes, cancellation
- Link from user settings page

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/subscription/tiers` | List active subscription tiers |
| POST | `/api/subscription/checkout` | Create Stripe Checkout Session (body: `{ tierId }`) |
| POST | `/api/subscription/portal` | Create Stripe Customer Portal session |
| GET | `/api/credits/balance` | Get current credit balance |
| GET | `/api/credits/transactions` | Paginated credit transaction history |
| POST | `/api/webhooks/stripe` | Stripe webhook handler (verify signature!) |

### Dependencies & Blockers
- **Stripe account** must be set up with products/prices
- **Webhook endpoint** must be registered in Stripe Dashboard (use Stripe CLI for local dev)
- Phase 1 auth must be complete

### Estimated Effort: **6 days**

**Day 6:** Stripe setup, seed tiers, checkout API  
**Day 7:** Webhook handler — subscription created, invoice paid  
**Day 8:** Webhook handler — upgrades, downgrades, cancellations  
**Day 9:** Credit issuance logic, transaction ledger  
**Day 10:** Pricing page UI, checkout flow UI, success page  
**Day 11:** Customer portal integration, credit balance in nav, test full lifecycle

---

## Phase 3 — Sample Upload, Storage & Streaming (Days 12–19)

### What Gets Built
- Supabase Storage buckets: `samples` (private), `previews` (public), `covers` (public)
- Sample upload form (WAV only, max 100MB)
- Server-side WAV validation (format, duration extraction)
- Auto-generate lower-quality preview from uploaded WAV
- Audio streaming via signed URLs (preview = public, full = signed/private)
- Custom audio player component (play/pause, waveform, progress — no download button)
- Sample metadata form (name, genre, instrument, key, BPM, type, tags, credit price)
- Slug auto-generation from sample name

### Technical Implementation Notes

**Storage Buckets (Supabase):**
```sql
-- Create via Supabase Dashboard or SQL
INSERT INTO storage.buckets (id, name, public) VALUES ('samples', 'samples', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('previews', 'previews', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('covers', 'covers', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('applications', 'applications', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
```

**Upload Flow:**
1. Creator selects WAV file → client validates file type + size (<100MB)
2. Upload to Supabase Storage `samples/` bucket via signed upload URL
3. Server-side processing (API route or Supabase Edge Function):
   - Validate WAV header (must be PCM WAV)
   - Extract duration → `durationMs`
   - Get file size → `fileSizeBytes`
   - Generate preview: convert to 128kbps MP3 or lower-quality WAV using `ffmpeg` (Vercel serverless has size limits — **use Supabase Edge Function with Deno for this, or a separate processing step**)
   - Upload preview to `previews/` bucket
4. Create `Sample` record with all metadata + `fileUrl` + `previewUrl`

**⚠️ FFmpeg on Vercel:** Vercel serverless functions have a 50MB bundle limit and 10s execution timeout (on Hobby). Options:
- **Option A (Recommended):** Use a Supabase Edge Function triggered by storage upload to process audio. Deno has WASM-based audio processing libraries.
- **Option B:** Use a lightweight npm package like `audiobuffer-to-wav` for format validation, and pre-generate previews client-side before upload (less secure).
- **Option C:** Use an external service (e.g., Transloadit, Cloudinary) for audio transcoding. Adds cost but is reliable.
- **Decision for Phase 1:** Use **Option A** — Supabase Edge Function with a WASM ffmpeg build, or if too complex, skip auto-preview generation and require creators to upload a separate preview file.

**Streaming Security:**
- Full WAV files: stored in private bucket, served via Supabase signed URLs (expiry: 60 seconds)
- Preview files: public bucket, served via CDN — these are the streamable files
- Audio player uses `<audio>` element with `previewUrl` as source
- No download attribute; `Content-Disposition: inline` enforced by Supabase
- **Additional protection:** Use a proxy API route (`/api/stream/[sampleId]`) that checks auth + purchase status before returning signed URL for full quality

**Slug Generation:**
```typescript
import { nanoid } from 'nanoid';
function generateSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `${base}-${nanoid(6)}`;
}
```

**Audio Player Component:**
- Use `wavesurfer.js` for waveform visualization
- Custom controls: play/pause, progress bar, time display
- No download button, no right-click save option (CSS: `pointer-events` on source)
- Responsive width, dark theme styling

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/samples/upload-url` | Generate signed upload URL for Supabase Storage |
| POST | `/api/samples` | Create sample record with metadata (after upload complete) |
| PUT | `/api/samples/[id]` | Update sample metadata (creator or mod) |
| GET | `/api/samples/[id]` | Get sample details |
| GET | `/api/stream/[id]` | Proxy endpoint — returns signed URL for full WAV (auth + purchase required) |
| POST | `/api/samples/[id]/preview` | Trigger preview generation (if async) |

### Dependencies & Blockers
- Supabase Storage buckets configured with correct RLS policies
- Decision on audio processing approach (ffmpeg alternative)
- `wavesurfer.js` or equivalent audio visualization library
- Phase 1 auth (for creator role check)

### Estimated Effort: **8 days**

**Day 12:** Set up Supabase Storage buckets, RLS policies, signed URL generation  
**Day 13:** Upload form UI, client-side WAV validation, upload to storage  
**Day 14:** Server-side WAV validation, metadata extraction (duration, file size)  
**Day 15:** Preview generation pipeline (edge function or alternative approach)  
**Day 16:** Sample creation API, metadata form (genre, key, BPM, etc.)  
**Day 17:** Audio player component with wavesurfer.js, dark theme  
**Day 18:** Streaming proxy endpoint, signed URL security  
**Day 19:** End-to-end testing: upload → process → store → stream

---

## Phase 4 — Marketplace Browse, Search & Filtering (Days 20–26)

### What Gets Built
- Marketplace homepage: featured/new/popular samples grid
- Full-text search across sample name, tags, creator name
- Filter sidebar: genre, instrument type, key, BPM range, sample type (loop/one-shot)
- Sort options: newest, most popular, highest rated
- Infinite scroll / pagination
- Creator profile pages (public)
- Creator listing page (browse all creators)

### Technical Implementation Notes

**Postgres Full-Text Search:**
```sql
-- Add a generated tsvector column to samples table
ALTER TABLE samples ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(genre, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(instrument_type, '')), 'B')
  ) STORED;

CREATE INDEX idx_samples_search ON samples USING GIN (search_vector);

-- For tag search, join with sample_tags
-- For creator name search, join with users table
```

**Add this via a Prisma migration** (raw SQL in migration file since Prisma doesn't natively support `tsvector`).

**Search Query Pattern:**
```typescript
// In API route
const results = await prisma.$queryRaw`
  SELECT s.*, u.artist_name as creator_name
  FROM samples s
  JOIN users u ON s.creator_id = u.id
  LEFT JOIN sample_tags st ON s.id = st.sample_id
  WHERE s.is_active = true
    AND (${query}::text IS NULL OR s.search_vector @@ plainto_tsquery('english', ${query})
         OR st.tag ILIKE ${'%' + query + '%'})
    AND (${genre}::text IS NULL OR s.genre = ${genre})
    AND (${instrumentType}::text IS NULL OR s.instrument_type = ${instrumentType})
    AND (${sampleType}::text IS NULL OR s.type = ${sampleType}::\"SampleType\")
    AND (${key}::text IS NULL OR s.key = ${key})
    AND (${bpmMin}::int IS NULL OR s.bpm >= ${bpmMin})
    AND (${bpmMax}::int IS NULL OR s.bpm <= ${bpmMax})
  GROUP BY s.id, u.artist_name
  ORDER BY ${orderBy}
  LIMIT ${limit} OFFSET ${offset}
`;
```

**Filter Options (seed/hardcode for Phase 1):**
```typescript
const GENRES = ['Hip Hop', 'R&B', 'Pop', 'Electronic', 'Trap', 'Lo-Fi', 'Rock', 'Jazz', 'Latin', 'Afrobeats', 'House', 'Drill'];
const INSTRUMENTS = ['Drums', 'Bass', 'Synth', 'Guitar', 'Piano', 'Vocals', 'FX', 'Strings', 'Brass', 'Pad'];
const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']; // + Major/Minor suffix
const SAMPLE_TYPES = ['LOOP', 'ONE_SHOT'];
```

**Marketplace Grid Layout:**
- Desktop: 4-column grid with sample cards
- Each card: cover image (or waveform placeholder), name, creator, genre, BPM, key, credit price, play button, favorite icon
- Inline audio player: clicking play on a card starts streaming the preview; playing another stops the previous
- **Global audio player bar** at bottom of page (like Spotify) — persists across navigation

**Pagination:**
- Use cursor-based pagination for infinite scroll (more performant than offset for large datasets)
- Cursor = `createdAt` + `id` composite for deterministic ordering
- Return `hasMore` flag + `nextCursor` in response

**Creator Profile Page (`/creator/[username]`):**
- Banner, avatar, artist name, bio, social links
- Follower count, total samples, average rating
- Sample grid (all active samples by this creator)
- Follow button

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/marketplace/samples` | Search + filter + paginate samples |
| GET | `/api/marketplace/samples/[slug]` | Get single sample detail page |
| GET | `/api/marketplace/featured` | Featured/trending samples (curated or algorithmic) |
| GET | `/api/creators` | List all creators (paginated) |
| GET | `/api/creators/[username]` | Get creator public profile |
| GET | `/api/filters/options` | Get available filter values (genres, instruments, keys) |

### Dependencies & Blockers
- Phase 3 must be complete (samples exist in DB)
- Need seed data: at least 50-100 sample records for testing search/filter
- `wavesurfer.js` component from Phase 3

### Estimated Effort: **7 days**

**Day 20:** Postgres full-text search setup, migration for tsvector  
**Day 21:** Search + filter API endpoint with all query params  
**Day 22:** Marketplace grid UI, sample cards, filter sidebar  
**Day 23:** Infinite scroll / pagination, sort options  
**Day 24:** Global audio player bar (bottom persistent player)  
**Day 25:** Creator profile page, creator listing page  
**Day 26:** Polish search UX, test edge cases (empty results, special characters)

---

## Phase 5 — Purchases, Library & Engagement (Days 27–33)

### What Gets Built
- Purchase flow: spend credits to acquire a sample
- Credit deduction with transaction logging
- User library: grid of all purchased samples with re-download
- Download endpoint with signed URLs (works even if sample is deactivated)
- Rating system (1–5 stars, one per user per sample)
- Favorites system (toggle favorite on any sample)
- Follow/unfollow creators
- "My Favorites" page
- "Following" page with feed of new samples from followed creators

### Technical Implementation Notes

**Purchase Flow (Critical — must be atomic):**
```typescript
async function purchaseSample(userId: string, sampleId: string) {
  return prisma.$transaction(async (tx) => {
    // 1. Check sample exists and is active
    const sample = await tx.sample.findUniqueOrThrow({
      where: { id: sampleId, isActive: true }
    });

    // 2. Check not already purchased
    const existing = await tx.purchase.findUnique({
      where: { userId_sampleId: { userId, sampleId } }
    });
    if (existing) throw new Error('Already purchased');

    // 3. Check sufficient credits
    const balance = await tx.creditBalance.findUniqueOrThrow({
      where: { userId }
    });
    if (balance.balance < sample.creditPrice) {
      throw new Error('Insufficient credits');
    }

    // 4. Deduct credits
    await tx.creditBalance.update({
      where: { userId },
      data: { balance: { decrement: sample.creditPrice } }
    });

    // 5. Create credit transaction
    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -sample.creditPrice,
        type: 'PURCHASE',
        referenceId: sampleId,
        note: `Purchased: ${sample.name}`
      }
    });

    // 6. Create purchase record
    const purchase = await tx.purchase.create({
      data: { userId, sampleId, creditsSpent: sample.creditPrice }
    });

    // 7. Increment download count
    await tx.sample.update({
      where: { id: sampleId },
      data: { downloadCount: { increment: 1 } }
    });

    return purchase;
  });
}
```

**Download Flow:**
1. User clicks "Download" on a purchased sample
2. API verifies user has a `Purchase` record for this sample
3. Generate signed URL for the WAV file in private `samples` bucket (60s expiry)
4. Log `Download` record (for analytics + payout calculations)
5. Return signed URL → browser initiates download
6. **Key:** Works even if `sample.isActive === false` — check `Purchase` table, not `Sample.isActive`

**Rating System:**
- Upsert pattern: user can rate once, update later
- After each rating change, recalculate `sample.ratingAvg` and `sample.ratingCount`
- Use a DB trigger or calculate in application code:
```typescript
// After rating upsert:
const stats = await prisma.rating.aggregate({
  where: { sampleId },
  _avg: { score: true },
  _count: true,
});
await prisma.sample.update({
  where: { id: sampleId },
  data: {
    ratingAvg: stats._avg.score ?? 0,
    ratingCount: stats._count,
  },
});
```

**Favorites:** Simple toggle with `@@unique([userId, sampleId])` constraint. Use `upsert` + `delete` pattern.

**Follow System:** Same toggle pattern. `@@unique([followerId, creatorId])`.

**Library Page (`/library`):**
- Grid of all purchased samples with: name, creator, download date, download button
- Search/filter within library
- Re-download count is unlimited

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/purchases` | Purchase a sample (body: `{ sampleId }`) |
| GET | `/api/purchases` | Get user's purchase history (paginated) |
| GET | `/api/library` | Get user's library (purchased samples with details) |
| GET | `/api/downloads/[sampleId]` | Generate download signed URL (requires purchase) |
| POST | `/api/ratings` | Rate a sample (body: `{ sampleId, score }`) |
| GET | `/api/ratings/[sampleId]` | Get user's rating for a sample |
| POST | `/api/favorites/toggle` | Toggle favorite (body: `{ sampleId }`) |
| GET | `/api/favorites` | Get user's favorites (paginated) |
| POST | `/api/follows/toggle` | Toggle follow (body: `{ creatorId }`) |
| GET | `/api/follows` | Get user's followed creators |
| GET | `/api/feed` | New samples from followed creators (paginated, sorted by date) |

### Dependencies & Blockers
- Phase 2 (credit system) must work for purchases
- Phase 3 (storage + signed URLs) must work for downloads
- Phase 4 (marketplace) provides the UI context for purchase buttons

### Estimated Effort: **7 days**

**Day 27:** Purchase flow (atomic transaction), credit deduction  
**Day 28:** Download endpoint with signed URLs, download logging  
**Day 29:** Library page UI with re-download functionality  
**Day 30:** Rating system (API + UI stars component)  
**Day 31:** Favorites system (toggle + favorites page)  
**Day 32:** Follow/unfollow system, following feed  
**Day 33:** Integration testing — full flow: subscribe → get credits → browse → purchase → download → rate

---

## Phase 6 — Creator System & Payouts (Days 34–42)

### What Gets Built
- Creator application form (artist name, bio, social links, 40-sample ZIP upload)
- Creator application status page (pending/approved/denied)
- On approval: role upgrade to CREATOR, Stripe Connect onboarding
- Creator dashboard: sample management, analytics, payout history
- Monthly payout calculation job
- Stripe Connect Express account creation + payout execution
- Creator sample management (upload, edit metadata, view stats per sample)

### Technical Implementation Notes

**Creator Application Flow:**
1. User navigates to `/apply` → fills form:
   - Artist name (checked for uniqueness)
   - Bio (text area)
   - Social links: SoundCloud, Spotify, Instagram (all optional but at least one required)
   - Sample ZIP file: max 200MB, must contain ≥40 WAV files
2. ZIP uploaded to `applications/` bucket (private)
3. `CreatorApplication` record created with status `PENDING`
4. User sees "Application Pending" status page
5. Moderator reviews (Phase 7) → approves/denies
6. On approval:
   - User's `role` → `CREATOR`
   - User's `artistName` set from application
   - Email notification (optional Phase 1, nice-to-have)

**Stripe Connect Onboarding (post-approval):**
```typescript
// When creator is approved, prompt them to set up Stripe Connect
const account = await stripe.accounts.create({
  type: 'express',
  email: user.email,
  capabilities: { transfers: { requested: true } },
});

// Save account ID
await prisma.user.update({
  where: { id: userId },
  data: { stripeConnectId: account.id },
});

// Generate onboarding link
const accountLink = await stripe.accountLinks.create({
  account: account.id,
  refresh_url: `${BASE_URL}/creator/onboarding?refresh=true`,
  return_url: `${BASE_URL}/creator/dashboard`,
  type: 'account_onboarding',
});
// Redirect creator to accountLink.url
```

**Creator Dashboard (`/creator/dashboard`):**
- **Overview cards:** Total downloads (30 days), estimated payout this month, total earnings all-time
- **Sample management:** Table of all uploaded samples with: name, downloads, rating, status, edit button
  - Creators **cannot delete** published samples (business rule) — only mods/admins can deactivate
  - Creators can edit metadata (name, tags, genre, etc.) but not the audio file
- **Payout history:** Table of past payouts with: period, credits earned, amount, status

**Monthly Payout Calculation:**
```typescript
// Run as a cron job on the 1st of each month (Vercel Cron or Supabase pg_cron)
async function calculateMonthlyPayouts() {
  const periodStart = startOfMonth(subMonths(new Date(), 1));
  const periodEnd = endOfMonth(subMonths(new Date(), 1));

  // Get all credits spent on each creator's samples during the period
  const creatorEarnings = await prisma.$queryRaw`
    SELECT s.creator_id, SUM(p.credits_spent) as total_credits
    FROM purchases p
    JOIN samples s ON p.sample_id = s.id
    WHERE p.created_at >= ${periodStart} AND p.created_at < ${periodEnd}
    GROUP BY s.creator_id
    HAVING SUM(p.credits_spent) > 0
  `;

  for (const earning of creatorEarnings) {
    const amountCents = earning.total_credits * 3; // $0.03 per credit = 3 cents
    if (amountCents < 5000) continue; // $50 minimum threshold

    await prisma.creatorPayout.create({
      data: {
        creatorId: earning.creator_id,
        periodStart,
        periodEnd,
        totalCreditsSpent: earning.total_credits,
        amountUsdCents: amountCents,
        status: 'PENDING',
      },
    });
  }
}
```

**Payout Execution (separate step — can be manual for Phase 1):**
```typescript
async function executePayouts() {
  const pending = await prisma.creatorPayout.findMany({
    where: { status: 'PENDING' },
    include: { creator: true },
  });

  for (const payout of pending) {
    if (!payout.creator.stripeConnectId) {
      await prisma.creatorPayout.update({
        where: { id: payout.id },
        data: { status: 'FAILED' },
      });
      continue;
    }

    try {
      const transfer = await stripe.transfers.create({
        amount: payout.amountUsdCents,
        currency: 'usd',
        destination: payout.creator.stripeConnectId,
      });

      await prisma.creatorPayout.update({
        where: { id: payout.id },
        data: {
          status: 'PAID',
          stripeTransferId: transfer.id,
          paidAt: new Date(),
        },
      });
    } catch (error) {
      await prisma.creatorPayout.update({
        where: { id: payout.id },
        data: { status: 'FAILED' },
      });
    }
  }
}
```

**Cron Setup (Vercel):**
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/calculate-payouts",
      "schedule": "0 2 1 * *"  // 1st of every month at 2am UTC
    },
    {
      "path": "/api/cron/execute-payouts",
      "schedule": "0 4 1 * *"  // 1st of every month at 4am UTC (after calculation)
    }
  ]
}
```

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/creator/apply` | Submit creator application (multipart: form data + ZIP) |
| GET | `/api/creator/application` | Get current user's application status |
| POST | `/api/creator/connect/onboard` | Generate Stripe Connect onboarding link |
| GET | `/api/creator/connect/status` | Check Stripe Connect account status |
| GET | `/api/creator/dashboard` | Get dashboard overview stats |
| GET | `/api/creator/samples` | Get creator's own samples (with stats) |
| GET | `/api/creator/payouts` | Get payout history |
| POST | `/api/cron/calculate-payouts` | Cron: calculate monthly payouts (auth: cron secret) |
| POST | `/api/cron/execute-payouts` | Cron: execute pending payouts (auth: cron secret) |

### Dependencies & Blockers
- **Stripe Connect** must be enabled on the Stripe account (requires platform agreement)
- Phase 3 (sample upload) for the application ZIP upload
- Phase 1 (auth + roles) for role upgrade on approval
- Vercel Pro plan recommended for cron jobs (Hobby has limited crons)

### Estimated Effort: **9 days**

**Day 34:** Creator application form UI + ZIP upload  
**Day 35:** Application API, storage, status page  
**Day 36:** Stripe Connect setup, account creation, onboarding flow  
**Day 37:** Creator dashboard layout, overview stats queries  
**Day 38:** Sample management table (list, edit metadata)  
**Day 39:** Payout calculation logic, cron job setup  
**Day 40:** Payout execution via Stripe transfers  
**Day 41:** Payout history UI, estimated earnings display  
**Day 42:** Test full creator lifecycle: apply → approve → onboard → upload → earn → get paid

---

## Phase 7 — Moderation Dashboard (Days 43–49)

### What Gets Built
- Mod dashboard at `/mod/*`
- Creator application review queue (listen to samples, approve/deny with notes)
- Sample review queue (review newly uploaded samples, edit metadata, deactivate)
- Audit log viewer (all mod/admin actions tracked)
- Sample deactivation (remove from marketplace but preserve for existing purchasers)

### Technical Implementation Notes

**Application Review (`/mod/applications`):**
- Table: applicant name, email, date, status, action buttons
- Detail view: all form fields, social links (clickable), ZIP file download link
- **ZIP Preview:** Ideally, list the WAV files in the ZIP and allow streaming individual samples from the ZIP. For Phase 1, just provide a download link for the full ZIP.
- Actions: Approve (with optional note) or Deny (with required note)
- On approve: trigger role change + email notification (if implemented)

**Sample Review (`/mod/samples`):**
- Table of all samples, filterable by: status (active/inactive), creator, date, flagged
- Detail view: all metadata, audio player, edit form
- Actions:
  - Edit metadata (genre, tags, BPM, key, etc.)
  - Deactivate sample (`isActive = false`) — removes from marketplace, keeps in purchasers' libraries
  - Reactivate sample (`isActive = true`)
- **Creators cannot delete samples** — this is enforced by not providing a delete endpoint for creator role. Only MOD/ADMIN can deactivate.

**Audit Log:**
Every mod/admin action creates an `AuditLog` entry:
```typescript
async function logAudit(actorId: string, action: string, targetType: string, targetId: string, metadata?: any) {
  await prisma.auditLog.create({
    data: { actorId, action, targetType, targetId, metadata }
  });
}

// Usage:
await logAudit(modUserId, 'CREATOR_APPROVED', 'CreatorApplication', applicationId, { note: 'Great portfolio' });
await logAudit(modUserId, 'SAMPLE_DEACTIVATED', 'Sample', sampleId, { reason: 'Copyright claim' });
await logAudit(adminUserId, 'CREDIT_ADJUSTED', 'User', targetUserId, { amount: 50, reason: 'Customer support' });
```

**Audit Log Actions to Track:**
| Action | Target Type | When |
|--------|------------|------|
| `CREATOR_APPROVED` | CreatorApplication | Mod approves application |
| `CREATOR_DENIED` | CreatorApplication | Mod denies application |
| `SAMPLE_DEACTIVATED` | Sample | Mod/Admin deactivates sample |
| `SAMPLE_REACTIVATED` | Sample | Mod/Admin reactivates sample |
| `SAMPLE_METADATA_EDITED` | Sample | Mod/Admin edits sample metadata |
| `CREDIT_ADJUSTED` | User | Admin adjusts user's credits |
| `USER_DEACTIVATED` | User | Admin deactivates user |
| `USER_ROLE_CHANGED` | User | Admin changes user role |

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/mod/applications` | List applications (filterable by status) |
| GET | `/api/mod/applications/[id]` | Get application detail |
| POST | `/api/mod/applications/[id]/review` | Approve or deny (body: `{ decision, note }`) |
| GET | `/api/mod/samples` | List all samples (filterable, paginated) |
| PUT | `/api/mod/samples/[id]` | Edit sample metadata |
| POST | `/api/mod/samples/[id]/deactivate` | Deactivate sample |
| POST | `/api/mod/samples/[id]/reactivate` | Reactivate sample |
| GET | `/api/mod/audit-log` | Paginated audit log (filterable by action, actor, target) |

### Dependencies & Blockers
- Phase 6 (creator applications exist to review)
- Phase 3 (samples exist to moderate)
- Phase 1 (role-based middleware must gate `/mod/*` routes)

### Estimated Effort: **7 days**

**Day 43:** Mod dashboard layout, application queue API + UI  
**Day 44:** Application detail view with ZIP download, approve/deny actions  
**Day 45:** Application approval automation (role change, Connect prompt)  
**Day 46:** Sample review queue, filter/sort, detail view  
**Day 47:** Sample editing + deactivation/reactivation  
**Day 48:** Audit log system — logging utility, viewer UI  
**Day 49:** Test full moderation flow end-to-end

---

## Phase 8 — Admin Dashboard & Analytics (Days 50–57)

### What Gets Built
- Admin dashboard at `/admin/*`
- Analytics overview: 30-day rolling stats (new users, subscriptions, revenue, samples uploaded, purchases)
- User management: search users, view details, change roles, deactivate accounts
- Credit adjustments: manually add/remove credits for any user
- CSV export for: users, transactions, samples, payouts
- Payout management: view all payouts, retry failed, manual trigger
- All moderation features accessible to admin too

### Technical Implementation Notes

**Analytics Queries (30-day rolling window):**
```typescript
const thirtyDaysAgo = subDays(new Date(), 30);

// New users
const newUsers = await prisma.user.count({
  where: { createdAt: { gte: thirtyDaysAgo } }
});

// New subscriptions
const newSubs = await prisma.subscription.count({
  where: { createdAt: { gte: thirtyDaysAgo } }
});

// Revenue (sum of subscription payments via Stripe API or local calc)
// Option: query Stripe Reporting API for accurate revenue
// Simpler: count active subs * tier price
const activeSubsByTier = await prisma.subscription.groupBy({
  by: ['tierId'],
  where: { status: 'ACTIVE' },
  _count: true,
});

// Total purchases (credit spend)
const totalCreditsSpent = await prisma.creditTransaction.aggregate({
  where: {
    type: 'PURCHASE',
    createdAt: { gte: thirtyDaysAgo },
  },
  _sum: { amount: true },
});

// Samples uploaded
const samplesUploaded = await prisma.sample.count({
  where: { createdAt: { gte: thirtyDaysAgo } }
});
```

**Analytics Dashboard Layout:**
- Top row: KPI cards (new users, revenue, active subs, samples uploaded, total purchases)
- Charts: daily signups (line), subscription tier breakdown (pie), top genres (bar)
- Use `recharts` or `chart.js` for visualization

**User Management (`/admin/users`):**
- Search by email, username, or artist name
- User detail page: profile info, role, subscription, credit balance, transaction history, samples (if creator), purchases
- Actions:
  - Change role (dropdown: USER, CREATOR, MODERATOR, ADMIN)
  - Deactivate/reactivate account
  - Adjust credits (amount + reason → creates `ADMIN_ADJUSTMENT` transaction)

**Credit Adjustment:**
```typescript
async function adjustCredits(adminId: string, userId: string, amount: number, reason: string) {
  await prisma.$transaction([
    prisma.creditBalance.update({
      where: { userId },
      data: { balance: { increment: amount } }, // amount can be negative
    }),
    prisma.creditTransaction.create({
      data: {
        userId,
        amount,
        type: 'ADMIN_ADJUSTMENT',
        note: reason,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'CREDIT_ADJUSTED',
        targetType: 'User',
        targetId: userId,
        metadata: { amount, reason },
      },
    }),
  ]);
}
```

**CSV Export:**
```typescript
// Generic CSV export utility
function toCsv(data: Record<string, any>[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
  return [headers.join(','), ...rows].join('\n');
}

// API route returns with content-type: text/csv
// Headers: Content-Disposition: attachment; filename="users-export-2024-01-15.csv"
```

**Exportable Data Sets:**
- Users (id, email, username, role, subscription tier, credit balance, created date)
- Transactions (id, user email, amount, type, date, note)
- Samples (id, name, creator, genre, downloads, rating, date)
- Payouts (id, creator, period, amount, status, paid date)

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/admin/analytics` | Dashboard stats (30-day rolling) |
| GET | `/api/admin/analytics/charts` | Time-series data for charts |
| GET | `/api/admin/users` | Search/list users (paginated) |
| GET | `/api/admin/users/[id]` | Get user detail |
| PUT | `/api/admin/users/[id]/role` | Change user role |
| POST | `/api/admin/users/[id]/deactivate` | Deactivate user |
| POST | `/api/admin/users/[id]/credits` | Adjust credits (body: `{ amount, reason }`) |
| GET | `/api/admin/payouts` | List all payouts (filterable) |
| POST | `/api/admin/payouts/[id]/retry` | Retry failed payout |
| POST | `/api/admin/payouts/trigger` | Manually trigger payout calculation |
| GET | `/api/admin/export/users` | CSV export: users |
| GET | `/api/admin/export/transactions` | CSV export: credit transactions |
| GET | `/api/admin/export/samples` | CSV export: samples |
| GET | `/api/admin/export/payouts` | CSV export: payouts |

### Dependencies & Blockers
- All previous phases should be functional (admin sees everything)
- Charting library chosen (`recharts` recommended for React/Next.js)
- Phase 7 (audit log) for admin visibility

### Estimated Effort: **8 days**

**Day 50:** Admin layout, analytics overview API + KPI cards  
**Day 51:** Analytics charts (daily signups, tier breakdown, genre breakdown)  
**Day 52:** User management — search, list, detail view  
**Day 53:** User actions — role change, deactivation, credit adjustments  
**Day 54:** CSV export endpoints (all 4 data sets)  
**Day 55:** Payout management UI (view all, retry failed, manual trigger)  
**Day 56:** Admin access to all mod features (inherited routing)  
**Day 57:** End-to-end testing of admin flows

---

## Phase 9 — Polish, Mobile Gate & Dark Theme (Days 58–62)

### What Gets Built
- Dark theme refinement across all pages
- Mobile landing page redirect (desktop-only UX for Phase 1)
- Loading states, error boundaries, toast notifications
- SEO: meta tags, Open Graph, sample/creator page structured data
- Performance: image optimization, lazy loading, bundle analysis
- 404 and error pages
- Terms of Service and Privacy Policy pages (static)
- Email templates (optional): welcome, application status, payout received

### Technical Implementation Notes

**Mobile Redirect:**
```typescript
// middleware.ts — add mobile detection
import { userAgent } from 'next/server';

export function middleware(request: NextRequest) {
  const { device } = userAgent(request);
  const isMobile = device.type === 'mobile' || device.type === 'tablet';

  if (isMobile && !request.nextUrl.pathname.startsWith('/mobile')) {
    return NextResponse.redirect(new URL('/mobile', request.url));
  }
  // ... rest of auth middleware
}
```

**Mobile Landing Page (`/mobile`):**
- Clean, dark-themed page with GREENROOM logo
- Message: "GREENROOM is designed for desktop. We're working on a mobile experience."
- Email signup form for mobile launch notifications (store in a simple `waitlist` table or use a form service)

**Dark Theme System:**
```css
/* globals.css — using shadcn/ui dark theme tokens */
:root {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --card: 0 0% 5.9%;
  --card-foreground: 0 0% 98%;
  --primary: 142 76% 45%; /* Green accent — "GREENROOM" brand */
  --primary-foreground: 0 0% 98%;
  /* ... extend with brand colors */
}
```

**Error Handling:**
- Global error boundary (`error.tsx` in app directory)
- `not-found.tsx` for 404s
- Toast notifications via `sonner` or `react-hot-toast` (dark styled)
- API error responses: consistent shape `{ error: string, code: string }`

**SEO:**
```typescript
// app/marketplace/[slug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const sample = await getSample(params.slug);
  return {
    title: `${sample.name} by ${sample.creator.artistName} | GREENROOM`,
    description: `${sample.genre} ${sample.type.toLowerCase()} — ${sample.bpm} BPM, Key of ${sample.key}`,
    openGraph: {
      images: [sample.coverImageUrl || '/og-default.png'],
    },
  };
}
```

**Performance Checklist:**
- [ ] `next/image` for all images (covers, avatars)
- [ ] Dynamic imports for heavy components (wavesurfer, charts)
- [ ] Route segment preloading for common navigation paths
- [ ] Prisma query optimization: check for N+1 queries with `include` vs `select`
- [ ] Vercel Analytics integration for Core Web Vitals

### Dependencies & Blockers
- All functional features complete (Phases 1–8)
- Brand assets: logo, color palette, OG image template
- Legal copy for ToS and Privacy Policy

### Estimated Effort: **5 days**

**Day 58:** Dark theme audit, fix inconsistencies across all pages  
**Day 59:** Mobile detection middleware, mobile landing page  
**Day 60:** Loading states, error boundaries, toast notifications  
**Day 61:** SEO meta tags, OG images, structured data  
**Day 62:** Performance audit, image optimization, bundle analysis

---

## Phase 10 — Testing, QA & Deployment (Days 63–70)

### What Gets Built
- Unit tests for critical business logic (purchases, credits, payouts)
- Integration tests for API routes
- E2E tests for critical user flows
- Staging environment deployment
- Production deployment with monitoring
- Documentation

### Technical Implementation Notes

**Testing Stack:**
- **Unit tests:** Vitest (fast, Vite-based, works well with Next.js)
- **Integration tests:** Vitest + Prisma test utilities (separate test DB)
- **E2E tests:** Playwright (Vercel supports this natively)

**Critical Test Scenarios:**

| Category | Test |
|----------|------|
| Auth | Signup → profile completion → access marketplace |
| Auth | Incomplete profile → redirect to onboarding |
| Auth | Role-based route protection (user can't access /mod) |
| Credits | Subscribe → receive credits → check balance |
| Credits | Purchase → deduct credits → verify transaction log |
| Credits | Insufficient credits → purchase fails gracefully |
| Credits | Upgrade mid-cycle → bonus credits issued |
| Purchase | Atomic transaction: no double-purchase, no race conditions |
| Purchase | Download after sample deactivated → still works |
| Creator | Apply → mod approves → role changes → can upload |
| Creator | Upload WAV → validates format → creates sample record |
| Payout | Monthly calc: correct credit sum, $50 threshold, Stripe transfer |
| Search | Full-text search returns relevant results |
| Search | Filters combine correctly (genre + BPM + key) |

**Prisma Test Setup:**
```typescript
// test/setup.ts
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const testDbUrl = process.env.TEST_DATABASE_URL;

beforeAll(async () => {
  execSync(`DATABASE_URL="${testDbUrl}" npx prisma migrate deploy`);
});

afterAll(async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
  // Clean up test data
  await prisma.$executeRawUnsafe('TRUNCATE TABLE users CASCADE');
  await prisma.$disconnect();
});
```

**Deployment Checklist:**

**Staging:**
- [ ] Create Supabase staging project (separate from production)
- [ ] Create Stripe test mode products/prices
- [ ] Deploy to Vercel preview branch
- [ ] Configure environment variables
- [ ] Run full E2E test suite against staging
- [ ] Verify webhook delivery (Stripe → staging)

**Production:**
- [ ] Supabase production project (enable Row Level Security on all tables)
- [ ] Stripe live mode products/prices
- [ ] Custom domain configured on Vercel
- [ ] Environment variables set (all production keys)
- [ ] Stripe webhook endpoint registered (production URL)
- [ ] Vercel Cron jobs verified
- [ ] Database indexes verified (run `EXPLAIN ANALYZE` on key queries)
- [ ] Enable Vercel Analytics + Speed Insights
- [ ] Error monitoring: Sentry or Vercel's built-in error tracking
- [ ] Uptime monitoring: set up a basic health check endpoint

**Health Check Endpoint:**
```typescript
// app/api/health/route.ts
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', db: 'connected' });
  } catch {
    return Response.json({ status: 'error', db: 'disconnected' }, { status: 500 });
  }
}
```

**RLS Policies (Supabase — defense in depth):**
Even though Prisma bypasses RLS (uses the service role), set up RLS as a safety net:
```sql
-- Example: users can only read their own credit balance
ALTER TABLE credit_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own balance" ON credit_balances
  FOR SELECT USING (user_id = auth.uid());
```

### Estimated Effort: **8 days**

**Day 63:** Set up Vitest, write unit tests for credit/purchase logic  
**Day 64:** Integration tests for auth and subscription API routes  
**Day 65:** Integration tests for sample upload, marketplace, download APIs  
**Day 66:** Playwright E2E setup, critical flow tests  
**Day 67:** Staging environment deployment, configuration  
**Day 68:** QA pass: run all tests against staging, fix bugs  
**Day 69:** Production deployment, domain setup, monitoring  
**Day 70:** Final verification, documentation, handoff

---

## Environment Variables Reference

```bash
# .env.local (development)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Database (Supabase Postgres)
DATABASE_URL=postgresql://postgres:[password]@db.xxx.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:[password]@db.xxx.supabase.co:5432/postgres

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...  # Separate webhook for Connect events

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=your-random-cron-secret  # Verify cron job requests

# Optional
SENTRY_DSN=https://xxx@sentry.io/xxx
```

---

## Database Seeding Strategy

Create `prisma/seed.ts`:

```typescript
// 1. Subscription Tiers (always required)
const tiers = [
  { name: 'GA', displayName: 'General Admission', creditsPerMonth: 100, priceUsdCents: 1099 },
  { name: 'VIP', displayName: 'VIP', creditsPerMonth: 200, priceUsdCents: 1899 },
  { name: 'AA', displayName: 'All Access', creditsPerMonth: 500, priceUsdCents: 3499 },
];

// 2. Admin user (first user, manually set role)

// 3. Dev-only: test users (user, creator, mod), test samples (50+), test purchases
```

Run with: `npx prisma db seed`

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Vercel serverless timeout on large WAV uploads | Upload fails | Use direct-to-Supabase-Storage upload with signed URLs (bypasses Vercel) |
| FFmpeg not available on Vercel | No preview generation | Use Supabase Edge Function or external service (Transloadit) |
| Stripe Connect onboarding drop-off | Creators can't get paid | Allow delayed onboarding; remind on dashboard; payout accumulates |
| Race condition on credit purchase | Double-spend | Prisma `$transaction` with serializable isolation |
| Large audio files slow to stream | Bad UX | Use compressed MP3 previews (public CDN); WAV only for downloads |
| Search performance at scale | Slow queries | Start with Postgres FTS + indexes; migrate to Meilisearch if needed |
| Supabase Storage egress costs | Unexpected bills | Set up Vercel caching + CDN for public preview files |
| Stripe webhook missing/delayed | Credits not issued | Idempotent handlers + manual reconciliation endpoint for admin |

---

## Summary Timeline

| Phase | Days | Cumulative | Deliverable |
|-------|------|-----------|-------------|
| 1. Scaffolding & Auth | 5 | 5 | Working app with login + onboarding |
| 2. Subscriptions & Credits | 6 | 11 | Users can subscribe and get credits |
| 3. Sample Upload & Streaming | 8 | 19 | Creators can upload, users can stream previews |
| 4. Marketplace & Search | 7 | 26 | Browse, search, filter samples |
| 5. Purchases & Library | 7 | 33 | Buy samples, download, rate, favorite, follow |
| 6. Creator System & Payouts | 9 | 42 | Creator applications, dashboard, Stripe payouts |
| 7. Moderation Dashboard | 7 | 49 | Mods can review apps + samples, audit log |
| 8. Admin Dashboard | 8 | 57 | Analytics, user management, CSV exports |
| 9. Polish & Mobile Gate | 5 | 62 | Dark theme polish, mobile redirect, SEO |
| 10. Testing & Deployment | 8 | 70 | Tests, staging, production, monitoring |

**Total: ~70 working days (~14 weeks / 3.5 months) for 1 full-stack developer**

> **Note:** This is a realistic estimate assuming the developer is experienced with the stack. Add 20-30% buffer for unknowns, scope changes, and bug fixes. A more conservative estimate would be **16–18 weeks**.

---

*Built for GREENROOM · v1.0 · Phase 1 Scope*
