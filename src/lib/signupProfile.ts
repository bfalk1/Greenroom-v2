/**
 * Profile fields carried through Supabase auth user_metadata so identity
 * exists the moment the users row is created, not after an onboarding step
 * half of signups never see (checkout-embedded signups are routed around
 * /onboarding by design — see /callback).
 *
 * Writers: the signup form (full_name / city / country) and Google OAuth
 * (the provider's full_name or name). Readers: both places a users row is
 * first created — /api/user/me's bootstrap and the /callback route.
 *
 * user_metadata is client-controlled, so treat it exactly like form input:
 * strip control characters, trim, cap lengths, and nothing more.
 */

function clean(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength)
    .trim();
  return s || undefined;
}

export function profileFromAuthMetadata(
  metadata: Record<string, unknown> | null | undefined
): { fullName?: string; city?: string; country?: string } {
  if (!metadata) return {};
  return {
    // full_name is set by our signup form and by Google; plain `name` is the
    // fallback some OAuth identities carry instead.
    fullName: clean(metadata.full_name, 120) ?? clean(metadata.name, 120),
    city: clean(metadata.city, 80),
    country: clean(metadata.country, 80),
  };
}
