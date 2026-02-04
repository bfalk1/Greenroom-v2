# GREENROOM 🎵

> Premium Music Samples for Your Sound

A subscription-based music sample marketplace built with Next.js, Supabase, Prisma, and Stripe.

## Tech Stack

- **Framework:** Next.js (App Router, TypeScript)
- **Database:** PostgreSQL via Supabase
- **ORM:** Prisma
- **Auth:** Supabase Auth
- **Payments:** Stripe (Subscriptions + Connect)
- **Styling:** Tailwind CSS + shadcn/ui
- **Deployment:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A Supabase project
- A Stripe account

### 1. Clone and install

```bash
git clone https://github.com/bfalk1/greenroom-v2.git
cd greenroom-v2
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.example .env.local
```

Fill in your Supabase and Stripe credentials in `.env.local`.

### 3. Set up the database

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Seed subscription tiers
npx prisma db seed
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/             # Login, signup, callback
│   ├── (main)/             # Authenticated pages (marketplace, library, etc.)
│   ├── creator/            # Creator dashboard & tools
│   ├── mod/                # Moderator dashboard
│   ├── admin/              # Admin dashboard
│   └── api/                # API routes
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── layout/             # Navbar, Footer, MobileGate
│   ├── audio/              # Audio player
│   └── marketplace/        # Sample cards, filters
├── lib/
│   ├── supabase/           # Supabase client utilities
│   ├── stripe/             # Stripe client & config
│   ├── prisma.ts           # Prisma singleton
│   └── utils.ts            # Utility functions
├── types/                  # TypeScript type definitions
└── middleware.ts            # Auth & role-based route protection
```

## Subscription Tiers

| Tier | Price | Credits/Month |
|------|-------|---------------|
| General Admission (GA) | $10.99/mo | 100 |
| VIP | $18.99/mo | 200 |
| All Access (AA) | $34.99/mo | 500 |

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npx prisma studio    # Open Prisma Studio (DB GUI)
npx prisma db push   # Push schema changes to DB
npx prisma db seed   # Seed the database
```

## License

Private — All rights reserved.
