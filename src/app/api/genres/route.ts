import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/genres - List all active genres
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const usedOnly = searchParams.get("usedOnly") === "true";

    const genres = usedOnly
      ? (
          await prisma.sample.findMany({
            where: {
              status: "PUBLISHED",
              isActive: true,
            },
            distinct: ["genre"],
            select: { genre: true },
            orderBy: { genre: "asc" },
          })
        )
          .map((sample) => sample.genre)
          .filter((genre): genre is string => Boolean(genre))
          .map((name) => ({ id: name, name, usageCount: 0 }))
      : await prisma.genre.findMany({
          where: { isActive: true },
          orderBy: [{ usageCount: "desc" }, { name: "asc" }],
          select: { id: true, name: true, usageCount: true },
        });

    return NextResponse.json({ genres });
  } catch (error) {
    console.error("Error fetching genres:", error);
    return NextResponse.json(
      { error: "Failed to fetch genres" },
      { status: 500 }
    );
  }
}

// POST /api/genres - Create or get genre (returns existing if duplicate)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Genre name is required" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      return NextResponse.json(
        { error: "Genre name must be 2-50 characters" },
        { status: 400 }
      );
    }

    // Normalize: lowercase, remove extra spaces
    const normalizedName = trimmedName.toLowerCase().replace(/\s+/g, " ");

    // Check if genre already exists (case-insensitive)
    const existing = await prisma.genre.findUnique({
      where: { normalizedName },
    });

    if (existing) {
      // Return existing genre
      return NextResponse.json({
        genre: { id: existing.id, name: existing.name },
        created: false,
      });
    }

    // Create new genre
    const genre = await prisma.genre.create({
      data: {
        name: trimmedName,
        normalizedName,
        isCustom: true,
        usageCount: 0,
        createdBy: user.id,
      },
    });

    return NextResponse.json({
      genre: { id: genre.id, name: genre.name },
      created: true,
    });
  } catch (error) {
    console.error("Error creating genre:", error);
    return NextResponse.json(
      { error: "Failed to create genre" },
      { status: 500 }
    );
  }
}
