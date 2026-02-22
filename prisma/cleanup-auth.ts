import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function cleanup() {
  console.log("🧹 Cleaning up old auth users...");
  const { data } = await supabase.auth.admin.listUsers();
  if (data?.users) {
    for (const user of data.users) {
      if (user.email?.endsWith('@greenroom.fm')) {
        await supabase.auth.admin.deleteUser(user.id);
        console.log('  Deleted:', user.email);
      }
    }
  }
  console.log("✅ Cleanup done");
}

cleanup();
