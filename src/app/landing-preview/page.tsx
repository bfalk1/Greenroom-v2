import { redirect } from "next/navigation";

// The preview landing page was promoted to the real landing page at /.
// Forward the incoming query string (fbclid + utm_*/gclid) so a Meta ad that
// targets this path doesn't lose its click id on the redirect — the pixel on /
// then still mints _fbc. (Middleware's gr_fbc capture already backstops the
// CAPI side, but this keeps the browser pixel whole too.)
export default async function LandingPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else if (value !== undefined) {
      qs.set(key, value);
    }
  }
  const query = qs.toString();
  redirect(query ? `/?${query}` : "/");
}
