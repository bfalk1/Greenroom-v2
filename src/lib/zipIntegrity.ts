/**
 * Pure byte-level ZIP integrity checks, shared by the browser upload client
 * (pre-upload) and the server-side stored-object validator (post-upload).
 *
 * A ZIP is only openable if it ends with an End of Central Directory record.
 * A file grabbed while it was still being written — e.g. selected in the file
 * picker mid-compression or mid-cloud-sync — has valid entries at the front
 * but no EOCD, and every archive tool rejects it. Checking the head signature
 * alone would miss exactly that failure, so both ends are checked.
 */

/** EOCD fixed record (22 bytes) + maximum trailing comment length. The EOCD is
 *  always within this distance of the end of a valid archive. */
export const ZIP_EOCD_SCAN_BYTES = 22 + 0xffff;

/** True if the buffer starts with a ZIP local-file-header signature
 *  (PK\x03\x04). Deliberately excludes an entry-less archive (bare EOCD) —
 *  an empty ZIP is never a valid upload here. */
export function hasZipLocalHeader(head: Uint8Array): boolean {
  return (
    head.length >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    head[2] === 0x03 &&
    head[3] === 0x04
  );
}

/** True if the End of Central Directory signature (PK\x05\x06) appears in
 *  `tail`, the last ZIP_EOCD_SCAN_BYTES (or fewer) of the file. Scans backward
 *  because the EOCD sits at the very end, followed only by the comment. */
export function hasZipEocd(tail: Uint8Array): boolean {
  for (let i = tail.length - 22; i >= 0; i--) {
    if (
      tail[i] === 0x50 &&
      tail[i + 1] === 0x4b &&
      tail[i + 2] === 0x05 &&
      tail[i + 3] === 0x06
    ) {
      return true;
    }
  }
  return false;
}
