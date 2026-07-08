import { redirect } from "next/navigation";

// The preview landing page was promoted to the real landing page at /.
export default function LandingPreviewPage() {
  redirect("/");
}
