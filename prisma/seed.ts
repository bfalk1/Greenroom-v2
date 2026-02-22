import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

// Supabase admin client for creating auth users
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  console.log("🌱 Seeding database...");

  // Upsert subscription tiers
  const tiers = [
    {
      name: "GA",
      displayName: "General Admission",
      creditsPerMonth: 100,
      priceUsdCents: 1099,
      stripePriceId: "price_1Sx90A5k6Fwn7Cbz1uGYPTpZ",
    },
    {
      name: "VIP",
      displayName: "VIP",
      creditsPerMonth: 200,
      priceUsdCents: 1899,
      stripePriceId: "price_1Sx90Q5k6Fwn7CbzwN0qSyDO",
    },
    {
      name: "AA",
      displayName: "All Access",
      creditsPerMonth: 500,
      priceUsdCents: 3499,
      stripePriceId: "price_1Sx90e5k6Fwn7CbzYPkArchS",
    },
  ];

  for (const tier of tiers) {
    await prisma.subscriptionTier.upsert({
      where: { name: tier.name },
      update: {
        displayName: tier.displayName,
        creditsPerMonth: tier.creditsPerMonth,
        priceUsdCents: tier.priceUsdCents,
        stripePriceId: tier.stripePriceId,
      },
      create: {
        name: tier.name,
        displayName: tier.displayName,
        creditsPerMonth: tier.creditsPerMonth,
        priceUsdCents: tier.priceUsdCents,
        stripePriceId: tier.stripePriceId,
        isActive: true,
      },
    });
    console.log(`  ✅ Tier: ${tier.displayName} — $${(tier.priceUsdCents / 100).toFixed(2)}/mo, ${tier.creditsPerMonth} credits`);
  }

  // ─────────────────────────────────────────────
  // SEED SAMPLE DATA
  // ─────────────────────────────────────────────
  console.log("\n🎵 Seeding sample data...");

  // Create creator users
  const creatorNames = [
    "Ekali", "Montell2099", "Dabow", "Lizdek", "Midnight Mafia", "Jawns",
    "Rickyxsan", "Cerdin", "Odea", "Juelz", "Control Freak", "SSOS",
    "Capshun", "Quix", "Tisoki", "Tynan", "Hekler", "Gravedgr",
    "Kumarion", "MSFT", "Blvde Runner", "Henry Fong", "Drezo", "ALRT",
    "Axel Boy", "Kompany", "Cyclops", "Jiqui", "Celo", "Brokn", "So Sus", "Badlike"
  ];

  const creators = creatorNames.map((name) => {
    const username = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    return {
      email: `${username}@greenroom.fm`,
      username,
      artistName: name,
      role: "CREATOR" as const,
      bio: `Producer & artist`,
    };
  });

  const createdCreators: { id: string; artistName: string }[] = [];

  for (const c of creators) {
    // First, try to create auth user (or get existing)
    const password = c.username; // Simple password = username
    
    let authUserId: string;
    
    // Check if user already exists in our DB
    const existingUser = await prisma.user.findUnique({ where: { email: c.email } });
    
    if (existingUser) {
      authUserId = existingUser.id;
    } else {
      // Create auth user in Supabase
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: c.email,
        password,
        email_confirm: true, // Auto-confirm email
      });
      
      if (authError) {
        // If user already exists in auth, try to get them
        if (authError.message.includes("already been registered")) {
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const existing = users?.users.find(u => u.email === c.email);
          if (existing) {
            authUserId = existing.id;
          } else {
            console.error(`  ❌ Failed to create/find auth user for ${c.artistName}: ${authError.message}`);
            continue;
          }
        } else {
          console.error(`  ❌ Failed to create auth user for ${c.artistName}: ${authError.message}`);
          continue;
        }
      } else {
        authUserId = authData.user.id;
      }
    }
    
    // Create/update database user with matching ID
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: {
        username: c.username,
        artistName: c.artistName,
        role: c.role,
        bio: c.bio,
        profileCompleted: true,
      },
      create: {
        id: authUserId,
        email: c.email,
        username: c.username,
        artistName: c.artistName,
        role: c.role,
        bio: c.bio,
        profileCompleted: true,
        credits: 0,
      },
    });
    // Create approved CreatorApplication
    await prisma.creatorApplication.upsert({
      where: { userId: user.id },
      update: { status: "APPROVED" },
      create: {
        userId: user.id,
        artistName: c.artistName,
        bio: c.bio,
        sampleZipUrl: "seeded-creator",
        status: "APPROVED",
        reviewedAt: new Date(),
      },
    });
    
    createdCreators.push({ id: user.id, artistName: c.artistName! });
    console.log(`  ✅ Creator: ${c.artistName} (${c.email} / pass: ${password})`);
  }

  // Sample data
  const sampleData = [
    {
      name: "Deep House Groove 120",
      genre: "House",
      instrumentType: "Drums",
      sampleType: "LOOP" as const,
      key: "C Minor",
      bpm: 120,
      creditPrice: 3,
      tags: ["house", "deep", "groove", "drums"],
      creatorIdx: 0, // Will be randomized
      downloadCount: 45,
      ratingAvg: 4.5,
      ratingCount: 12,
    },
    {
      name: "Trap Hi-Hat Rolls",
      genre: "Trap",
      instrumentType: "Drums",
      sampleType: "LOOP" as const,
      key: "F# Minor",
      bpm: 140,
      creditPrice: 2,
      tags: ["trap", "hihats", "percussion", "rolls"],
      creatorIdx: 1,
      downloadCount: 32,
      ratingAvg: 4.2,
      ratingCount: 8,
    },
    {
      name: "Ambient Pad Progression",
      genre: "Electronic",
      instrumentType: "Pad",
      sampleType: "LOOP" as const,
      key: "A Minor",
      bpm: 80,
      creditPrice: 4,
      tags: ["ambient", "pad", "atmospheric", "lush"],
      creatorIdx: 2,
      downloadCount: 67,
      ratingAvg: 4.8,
      ratingCount: 20,
    },
    {
      name: "Lo-Fi Piano Chords",
      genre: "Lo-Fi",
      instrumentType: "Piano",
      sampleType: "LOOP" as const,
      key: "G Major",
      bpm: 90,
      creditPrice: 3,
      tags: ["lofi", "piano", "chill", "chords"],
      creatorIdx: 0,
      downloadCount: 51,
      ratingAvg: 4.6,
      ratingCount: 15,
    },
    {
      name: "808 Kick Punch",
      genre: "Trap",
      instrumentType: "Drums",
      sampleType: "ONE_SHOT" as const,
      key: "A Minor",
      bpm: null,
      creditPrice: 1,
      tags: ["808", "kick", "punch", "hard"],
      creatorIdx: 1,
      downloadCount: 28,
      ratingAvg: 4.0,
      ratingCount: 6,
    },
    {
      name: "R&B Guitar Strum",
      genre: "R&B",
      instrumentType: "Guitar",
      sampleType: "LOOP" as const,
      key: "D Minor",
      bpm: 95,
      creditPrice: 3,
      tags: ["rnb", "guitar", "strum", "smooth"],
      creatorIdx: 0,
      downloadCount: 38,
      ratingAvg: 4.4,
      ratingCount: 10,
    },
    {
      name: "Drill Bass Slide",
      genre: "Drill",
      instrumentType: "Bass",
      sampleType: "ONE_SHOT" as const,
      key: "E Minor",
      bpm: null,
      creditPrice: 2,
      tags: ["drill", "bass", "slide", "uk"],
      creatorIdx: 1,
      downloadCount: 22,
      ratingAvg: 3.9,
      ratingCount: 5,
    },
    {
      name: "Latin Percussion Loop",
      genre: "Latin",
      instrumentType: "Drums",
      sampleType: "LOOP" as const,
      key: "C Major",
      bpm: 105,
      creditPrice: 2,
      tags: ["latin", "percussion", "congas", "groove"],
      creatorIdx: 2,
      downloadCount: 19,
      ratingAvg: 4.3,
      ratingCount: 7,
    },
    {
      name: "Afrobeats Vocal Chop",
      genre: "Afrobeats",
      instrumentType: "Vocals",
      sampleType: "ONE_SHOT" as const,
      key: "G Minor",
      bpm: null,
      creditPrice: 2,
      tags: ["afrobeats", "vocal", "chop", "bounce"],
      creatorIdx: 0,
      downloadCount: 41,
      ratingAvg: 4.7,
      ratingCount: 14,
    },
    {
      name: "Synthwave Arp 128",
      genre: "Electronic",
      instrumentType: "Synth",
      sampleType: "LOOP" as const,
      key: "B Minor",
      bpm: 128,
      creditPrice: 3,
      tags: ["synthwave", "arp", "retro", "neon"],
      creatorIdx: 2,
      downloadCount: 55,
      ratingAvg: 4.9,
      ratingCount: 18,
    },
    {
      name: "Jazz Piano Riff",
      genre: "Jazz",
      instrumentType: "Piano",
      sampleType: "LOOP" as const,
      key: "D# Minor",
      bpm: 110,
      creditPrice: 4,
      tags: ["jazz", "piano", "riff", "smooth"],
      creatorIdx: 0,
      downloadCount: 33,
      ratingAvg: 4.5,
      ratingCount: 11,
    },
    {
      name: "Hip Hop Brass Stab",
      genre: "Hip Hop",
      instrumentType: "Brass",
      sampleType: "ONE_SHOT" as const,
      key: "F Minor",
      bpm: null,
      creditPrice: 1,
      tags: ["hiphop", "brass", "stab", "punchy"],
      creatorIdx: 1,
      downloadCount: 26,
      ratingAvg: 4.1,
      ratingCount: 9,
    },
    {
      name: "Pop Vocal Stack",
      genre: "Pop",
      instrumentType: "Vocals",
      sampleType: "LOOP" as const,
      key: "C Major",
      bpm: 118,
      creditPrice: 5,
      tags: ["pop", "vocal", "stack", "harmony"],
      creatorIdx: 2,
      downloadCount: 72,
      ratingAvg: 4.6,
      ratingCount: 22,
    },
    {
      name: "Rock Power Chord",
      genre: "Rock",
      instrumentType: "Guitar",
      sampleType: "ONE_SHOT" as const,
      key: "E Major",
      bpm: null,
      creditPrice: 2,
      tags: ["rock", "guitar", "power", "chord"],
      creatorIdx: 0,
      downloadCount: 15,
      ratingAvg: 4.0,
      ratingCount: 4,
    },
    {
      name: "FX Riser Sweep",
      genre: "Electronic",
      instrumentType: "FX",
      sampleType: "ONE_SHOT" as const,
      key: null,
      bpm: null,
      creditPrice: 1,
      tags: ["fx", "riser", "sweep", "transition"],
      creatorIdx: 2,
      downloadCount: 89,
      ratingAvg: 4.3,
      ratingCount: 25,
    },
  ];

  for (const s of sampleData) {
    // Pick a random creator from the pool
    const creator = createdCreators[Math.floor(Math.random() * createdCreators.length)];
    const slug =
      s.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") +
      "-" +
      Math.random().toString(36).slice(2, 8);

    await prisma.sample.upsert({
      where: { slug },
      update: {},
      create: {
        creatorId: creator.id,
        name: s.name,
        slug,
        fileUrl: `samples/placeholder/${slug}.wav`,
        previewUrl: `samples/placeholder/${slug}.wav`,
        coverImageUrl: null,
        sampleType: s.sampleType,
        genre: s.genre,
        instrumentType: s.instrumentType,
        key: s.key,
        bpm: s.bpm,
        creditPrice: s.creditPrice,
        tags: s.tags,
        downloadCount: 0,
        ratingAvg: 0,
        ratingCount: 0,
        isActive: true,
        status: "PUBLISHED",
      },
    });
    console.log(`  ✅ Sample: ${s.name} by ${creator.artistName}`);
  }

  console.log("\n🎉 Seeding complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
