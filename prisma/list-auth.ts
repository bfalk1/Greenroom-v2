import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function list() {
  const { data } = await supabase.auth.admin.listUsers();
  console.log("Auth users:", data?.users?.length || 0);
  data?.users?.forEach(u => console.log(`  - ${u.email} (${u.id})`));
}

list();
