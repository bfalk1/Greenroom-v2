// Browser-side SHA-256, shared by the ad pixels that must pre-hash an
// identifier themselves rather than let the vendor SDK do it.
//
// Kept in one place so every channel produces byte-identical digests for the
// same input: the Meta pixel's external_id has to equal the CAPI's
// sha256Lower(userId) for Meta to treat browser and server as one person, and
// a future TikTok Events API twin needs the same property.

// crypto.subtle needs a secure context (https / localhost); returns null if
// unavailable so callers omit the field rather than send it malformed.
export async function sha256Hex(value: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value)
    );
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
