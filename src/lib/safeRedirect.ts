/**
 * Validate a post-auth redirect target (e.g. the /vip flow threads
 * ?redirect=/vip through signup → callback → onboarding). Returns the path only
 * when it's a safe SAME-ORIGIN relative path so a crafted ?redirect can't bounce
 * the user to an external site after login/signup/onboarding:
 *   - must start with "/"           (relative)
 *   - must NOT start with "//"       (protocol-relative → other origin)
 *   - must NOT contain a backslash   (browsers normalize "\" to "/", so "/\evil.com" → "//evil.com")
 * Returns null when the input is missing or fails any check. Pure — safe to use
 * in both server routes and client components.
 */
export function safeRedirectPath(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("\\")) return null;
  return raw;
}
