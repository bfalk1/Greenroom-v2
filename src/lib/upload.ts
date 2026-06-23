/**
 * Server-side upload content validation.
 *
 * Uploads must NOT be trusted by their client-supplied MIME type or filename
 * extension alone — `file.type.startsWith("image/")` accepts `image/svg+xml`
 * (active content) and a renamed file can carry any bytes. These helpers check
 * the actual magic bytes and return a SERVER-derived content type to store, so
 * a public bucket can only ever serve the format we verified.
 */

type RasterResult =
  | { ok: true; ext: "jpg" | "png" | "webp"; contentType: string }
  | { ok: false; error: string };

/** Validate that `buffer` is a real JPEG/PNG/WebP and its extension matches. */
export function validateRasterImage(filename: string, buffer: Buffer): RasterResult {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (buffer.length < 12) {
    return { ok: false, error: "File is too small to be a valid image" };
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp =
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  if ((ext === "jpg" || ext === "jpeg") && isJpeg) {
    return { ok: true, ext: "jpg", contentType: "image/jpeg" };
  }
  if (ext === "png" && isPng) {
    return { ok: true, ext: "png", contentType: "image/png" };
  }
  if (ext === "webp" && isWebp) {
    return { ok: true, ext: "webp", contentType: "image/webp" };
  }

  return {
    ok: false,
    error: "Image must be a JPG, PNG, or WebP whose contents match its extension",
  };
}

/** Validate that `buffer` is a RIFF/WAVE file. */
export function isWavBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  );
}
