/**
 * Storage path validation.
 *
 * Sample/preset `fileUrl`/`previewUrl` values are stored verbatim from the
 * client and later split into `<bucket>/<path>` and handed to the SERVICE-ROLE
 * Supabase client (which bypasses RLS) for download, and to the preview worker
 * which feeds the path to ffmpeg. An unvalidated value therefore enables
 * cross-tenant object reads and (historically) shell injection in the worker.
 *
 * These helpers constrain a stored reference to an object the caller actually
 * owns, with a charset that contains no traversal (`..`), quotes, or shell
 * metacharacters. The upload routes generate `<bucket>/<userId>/<ts>-<rand>.<ext>`,
 * so an honest value always passes.
 */

// One path segment: starts alphanumeric, then alphanumerics + a small safe set.
// No slashes, spaces, quotes, backticks, semicolons, or other shell/meta chars.
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Validate a `<bucket>/<path>` reference and that every segment is safe. */
export function isSafeStorageRef(value: unknown, bucket: string): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    return false;
  }
  if (value.includes("..") || value.includes("\\")) return false;

  const segments = value.split("/");
  if (segments.length < 2) return false;
  if (segments[0] !== bucket) return false;
  // Every remaining segment must be a safe, non-empty token.
  return segments.slice(1).every((seg) => SAFE_SEGMENT.test(seg));
}

/**
 * Validate that a reference points into `bucket` AND is scoped to `ownerId`
 * (i.e. `<bucket>/<ownerId>/...`). Used at write time so a creator can only
 * register objects under their own prefix.
 */
export function isOwnedStorageRef(
  value: unknown,
  bucket: string,
  ownerId: string
): value is string {
  if (!isSafeStorageRef(value, bucket)) return false;
  return (value as string).startsWith(`${bucket}/${ownerId}/`);
}

/**
 * Extract the in-bucket path from a Supabase PUBLIC object URL, but only if it
 * points into `bucket` under `ownerId`'s prefix and is otherwise safe; returns
 * null for anything else (external URL, another tenant, traversal).
 *
 * Used when a client uploads directly to a public bucket via a signed URL and
 * posts the resulting public URL back — the server must confirm the URL is one
 * it minted for this owner before trusting/re-validating the object.
 */
export function ownedPublicObjectPath(
  url: unknown,
  bucket: string,
  ownerId: string
): string | null {
  if (typeof url !== "string") return null;
  const marker = `/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length).split("?")[0];
  if (!isOwnedStorageRef(`${bucket}/${path}`, bucket, ownerId)) return null;
  return path;
}
