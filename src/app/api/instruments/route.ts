import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { INSTRUMENT_CATEGORIES } from "@/lib/utils/genre";

// GET /api/instruments - Get all instrument types with categories
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const category = searchParams.get("category");

    let instruments;

    if (search || category) {
      const whereClause: Record<string, unknown> = { isActive: true };
      
      if (search) {
        whereClause.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { normalizedName: { contains: search.toLowerCase() } },
        ];
      }
      
      if (category) {
        whereClause.category = category;
      }

      instruments = await prisma.instrumentType.findMany({
        where: whereClause,
        orderBy: { usageCount: "desc" },
        take: 50,
      });
    } else {
      instruments = await prisma.instrumentType.findMany({
        where: { isActive: true },
        orderBy: [{ category: "asc" }, { usageCount: "desc" }],
      });
    }

    // Also return the category structure
    return NextResponse.json({ 
      instruments,
      categories: INSTRUMENT_CATEGORIES,
    });
  } catch (error) {
    console.error("Error fetching instruments:", error);
    return NextResponse.json(
      { error: "Failed to fetch instruments" },
      { status: 500 }
    );
  }
}

// PUT /api/instruments - Initialize default instrument types (admin only)
export async function PUT() {
  try {
    let created = 0;

    for (const [category, instruments] of Object.entries(INSTRUMENT_CATEGORIES)) {
      for (const name of instruments) {
        const normalized = name.toLowerCase().replace(/\s+/g, "-");
        const existing = await prisma.instrumentType.findUnique({
          where: { normalizedName: normalized },
        });

        if (!existing) {
          await prisma.instrumentType.create({
            data: {
              name,
              normalizedName: normalized,
              category,
            },
          });
          created++;
        }
      }
    }

    return NextResponse.json({
      message: `Initialized ${created} instrument types`,
      created,
    });
  } catch (error) {
    console.error("Error initializing instruments:", error);
    return NextResponse.json(
      { error: "Failed to initialize instruments" },
      { status: 500 }
    );
  }
}
