import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FEATURED_ARTISTS, type FeaturedCreator } from "@/lib/landing/featuredArtists";

/**
 * GET /api/landing/creators
 *
 * Resolves the curated "Verified creators" lineup to each producer's real
 * avatar + a representative genre. The landing page used to read avatars off
 * the incidental top-24 "popular" samples feed, so any featured artist who
 * wasn't in that slice fell back to a letter monogram — which was almost all of
 * them. This resolves the full lineup directly instead, so the tiles show real
 * producer photos.
 *
 * Prod queries the DB. Dev proxies the public prod catalog (the local DB is
 * usually empty) so localhost previews the same real avatars.
 */

const PROD_ORIGIN = "https://www.greenroom.fm";

// Cache the resolved lineup — it's curated and changes rarely.
export const revalidate = 3600;

export async function GET() {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json({ creators: await resolveFromProd() });
  }

  try {
    const rows = await prisma.user.findMany({
      where: {
        role: { in: ["CREATOR", "ADMIN"] },
        isActive: true,
        OR: FEATURED_ARTISTS.map((name) => ({
          artistName: { equals: name, mode: "insensitive" as const },
        })),
      },
      select: {
        artistName: true,
        avatarUrl: true,
        // Representative genre = the creator's most-downloaded published sample.
        samples: {
          where: { status: "PUBLISHED", isActive: true },
          orderBy: { downloadCount: "desc" },
          take: 1,
          select: { genre: true },
        },
      },
    });

    // artistName is unique, so at most one row per name.
    const byName = new Map<string, { avatar: string | null; genre: string | null }>();
    for (const r of rows) {
      const key = r.artistName?.trim().toLowerCase();
      if (!key) continue;
      byName.set(key, { avatar: r.avatarUrl, genre: r.samples[0]?.genre ?? null });
    }

    const creators: FeaturedCreator[] = FEATURED_ARTISTS.map((name) => {
      const info = byName.get(name.toLowerCase());
      return { name, avatar: info?.avatar ?? null, genre: info?.genre ?? null };
    });

    return NextResponse.json({ creators });
  } catch (error) {
    console.error("GET /api/landing/creators error:", error);
    // Degrade to monograms rather than breaking the page.
    return NextResponse.json(
      { creators: FEATURED_ARTISTS.map((name) => ({ name, avatar: null, genre: null })) },
      { status: 200 }
    );
  }
}

/**
 * DEV ONLY. The local catalog is usually empty, so borrow real avatars from the
 * public prod catalog: for each featured name, pull the matching artist's
 * avatar + genre from prod's search endpoint. Returns monogram-only tiles if
 * prod is unreachable.
 */
async function resolveFromProd(): Promise<FeaturedCreator[]> {
  return Promise.all(
    FEATURED_ARTISTS.map(async (name): Promise<FeaturedCreator> => {
      try {
        const res = await fetch(
          `${PROD_ORIGIN}/api/samples?search=${encodeURIComponent(name)}&limit=10`,
          { cache: "no-store", headers: { accept: "application/json" } }
        );
        if (res.ok) {
          const data = await res.json();
          const match = (Array.isArray(data.samples) ? data.samples : []).find(
            (s: { artist_name?: string }) =>
              s.artist_name?.trim().toLowerCase() === name.toLowerCase()
          );
          if (match) {
            return {
              name,
              avatar: match.creator_avatar ?? null,
              genre: match.genre ?? null,
            };
          }
        }
      } catch {
        /* fall through to monogram */
      }
      return { name, avatar: null, genre: null };
    })
  );
}
