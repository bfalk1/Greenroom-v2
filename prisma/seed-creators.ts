import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

// Initialize Supabase Admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Creator accounts to seed
const creators = [
  { artistName: "Name" },
  { artistName: "Ekali" },
  { artistName: "Montell2099" },
  { artistName: "Dabow" },
  { artistName: "Lizdek" },
  { artistName: "Midnight Mafia" },
  { artistName: "Jawns" },
  { artistName: "Rickyxsan" },
  { artistName: "Cerdin" },
  { artistName: "Odea" },
  { artistName: "Juelz" },
  { artistName: "Control Freak" },
  { artistName: "SSOS" },
  { artistName: "Capshun" },
  { artistName: "Quix" },
  { artistName: "Tisoki" },
  { artistName: "Tynan" },
  { artistName: "Hekler" },
  { artistName: "Gravedgr" },
  { artistName: "Kumarion" },
  { artistName: "MSFT" },
  { artistName: "Blvde Runner" },
  { artistName: "Henry Fong" },
  { artistName: "Drezo" },
  { artistName: "ALRT" },
  { artistName: "Axel Boy" },
  { artistName: "Kompany" },
  { artistName: "Cyclops" },
  { artistName: "Jiqui" },
  { artistName: "Celo" },
  { artistName: "Brokn" },
  { artistName: "So Sus" },
  { artistName: "Badlike" },
];

const DEFAULT_PASSWORD = "green room";

function generateUsername(artistName: string): string {
  return artistName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
}

function generateEmail(artistName: string): string {
  const username = artistName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return `${username}@greenroom.fm`;
}

async function main() {
  console.log("🎤 Seeding creator accounts...\n");

  const results: { artistName: string; email: string; status: string }[] = [];

  for (const creator of creators) {
    const email = generateEmail(creator.artistName);
    const username = generateUsername(creator.artistName);

    try {
      // Step 1: Create user in Supabase Auth
      const { data: authData, error: authError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: DEFAULT_PASSWORD,
          email_confirm: true, // Auto-confirm email
        });

      if (authError) {
        // Check if user already exists
        if (authError.message.includes("already been registered")) {
          // Get existing user
          const { data: existingUsers } =
            await supabaseAdmin.auth.admin.listUsers();
          const existingUser = existingUsers?.users.find(
            (u) => u.email === email
          );

          if (existingUser) {
            // Update Prisma record
            await prisma.user.upsert({
              where: { id: existingUser.id },
              update: {
                username,
                artistName: creator.artistName,
                role: "CREATOR",
                profileCompleted: true,
              },
              create: {
                id: existingUser.id,
                email,
                username,
                artistName: creator.artistName,
                role: "CREATOR",
                profileCompleted: true,
                credits: 0,
              },
            });
            results.push({
              artistName: creator.artistName,
              email,
              status: "✅ Already exists (updated)",
            });
            console.log(`  ✅ ${creator.artistName} — already exists (updated)`);
            continue;
          }
        }
        throw authError;
      }

      if (!authData.user) {
        throw new Error("No user returned from Supabase");
      }

      // Step 2: Create/update user in Prisma with Supabase auth ID
      await prisma.user.upsert({
        where: { id: authData.user.id },
        update: {
          email,
          username,
          artistName: creator.artistName,
          role: "CREATOR",
          profileCompleted: true,
        },
        create: {
          id: authData.user.id,
          email,
          username,
          artistName: creator.artistName,
          role: "CREATOR",
          profileCompleted: true,
          credits: 0,
        },
      });

      results.push({
        artistName: creator.artistName,
        email,
        status: "✅ Created",
      });
      console.log(`  ✅ ${creator.artistName} — ${email}`);
    } catch (error: any) {
      results.push({
        artistName: creator.artistName,
        email,
        status: `❌ Error: ${error.message}`,
      });
      console.error(`  ❌ ${creator.artistName} — ${error.message}`);
    }
  }

  console.log("\n" + "─".repeat(50));
  console.log("📋 SUMMARY");
  console.log("─".repeat(50));
  console.log(`Total: ${creators.length}`);
  console.log(`Created: ${results.filter((r) => r.status.includes("Created")).length}`);
  console.log(`Updated: ${results.filter((r) => r.status.includes("updated")).length}`);
  console.log(`Errors: ${results.filter((r) => r.status.includes("Error")).length}`);
  console.log("\n📧 All accounts use password: " + DEFAULT_PASSWORD);
  console.log("\n🎉 Done!");
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
