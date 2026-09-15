import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UnsubscribeForm } from "@/components/unsubscribe/UnsubscribeForm";
import { maskEmail, resolveUnsubscribeLink } from "@/lib/unsubscribeToken";

export const metadata: Metadata = {
  // Every link is specific to one recipient; keep them out of search indexes.
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const link = resolveUnsubscribeLink({
    token: firstParam(params.token),
    email: firstParam(params.email),
  });

  // Emails sent before tokens link here with the raw address. Swap it for a
  // token with a server redirect before anything renders: every tracker in the
  // root layout reads this URL, PostHog from useSearchParams during the very
  // first render, so a client-side router.replace would already be too late.
  // This also runs past the legacy cutoff, so an expired link still drops the
  // address from the URL.
  if (params.email !== undefined) {
    redirect(link.ok ? `/unsubscribe?token=${link.token}` : "/unsubscribe");
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-zinc-900 rounded-xl p-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">GREENROOM</h1>

        {link.ok ? (
          <UnsubscribeForm token={link.token} maskedEmail={maskEmail(link.email)} />
        ) : (
          <>
            <p className="text-white mb-2">This unsubscribe link isn&apos;t valid</p>
            <p className="text-zinc-400 text-sm">
              It may be incomplete or expired. Use the Unsubscribe link in a recent
              GREENROOM email, or{" "}
              <Link href="/contact" className="text-white underline">
                contact us
              </Link>{" "}
              and we&apos;ll take you off the list.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
