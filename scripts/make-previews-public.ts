import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase.storage.updateBucket("previews", {
    public: true,
  });
  
  if (error) {
    console.error("Failed to make bucket public:", error);
    process.exit(1);
  }
  
  console.log("✅ Previews bucket is now public");
  console.log("Public URL format: " + process.env.NEXT_PUBLIC_SUPABASE_URL + "/storage/v1/object/public/previews/<filename>");
}

main();
