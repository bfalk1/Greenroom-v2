import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { 
  normalizeGenre, 
  getCanonicalGenre, 
  validateGenre, 
  DEFAULT_GENRES 
} from "@/lib/utils/genre";

// GET /api/genres - Get all genres with optional search
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "50");

    let genres;
    
    if (search) {
      const normalized = normalizeGenre(search);
      genres = await prisma.genre.findMany({
        where: {
          isActive: true,
          OR: [
            { normalizedName: { contains: normalized } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        },
        orderBy: { usageCount: "desc" },
        take: limit,
      });
    } else {
      genres = await prisma.genre.findMany({
        where: { isActive: true },
        orderBy: { usageCount: "desc" },
        take: limit,
      });
    }

    return NextResponse.json({ genres });
  } catch (error) {
    console.error("Error fetching genres:", error);
    return NextResponse.json(
      { error: "Failed to fetch genres" },
      { status: 500 }
    );
  }
}

// POST /api/genres - Create a new genre (or return existing)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    // Validate the genre
    const validation = validateGenre(name);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const normalized = normalizeGenre(name);
    const canonical = getCanonicalGenre(name);

    // Check if genre already exists
    let genre = await prisma.genre.findFirst({
      where: {
        OR: [
          { normalizedName: normalized },
          { name: { equals: canonical, mode: "insensitive" } },
        ],
      },
    });

    if (genre) {
      // Return existing genre
      return NextResponse.json({ genre, existing: true });
    }

    // Create new genre
    genre = await prisma.genre.create({
      data: {
        name: canonical,
        normalizedName: normalized,
        isCustom: true,
        createdBy: user.id,
      },
    });

    return NextResponse.json({ genre, existing: false }, { status: 201 });
  } catch (error) {
    console.error("Error creating genre:", error);
    return NextResponse.json(
      { error: "Failed to create genre" },
      { status: 500 }
    );
  }
}

// Initialize default genres (called once during setup)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });

    if (dbUser?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    // Seed default genres
    let created = 0;
    for (const genreName of DEFAULT_GENRES) {
      const normalized = normalizeGenre(genreName);
      const existing = await prisma.genre.findUnique({
        where: { normalizedName: normalized },
      });

      if (!existing) {
        await prisma.genre.create({
          data: {
            name: genreName,
            normalizedName: normalized,
            isCustom: false,
          },
        });
        created++;
      }
    }

    return NextResponse.json({ 
      message: `Initialized ${created} genres`,
      total: DEFAULT_GENRES.length,
      created,
    });
  } catch (error) {
    console.error("Error initializing genres:", error);
    return NextResponse.json(
      { error: "Failed to initialize genres" },
      { status: 500 }
    );
  }
}
