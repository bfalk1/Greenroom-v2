import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasZipLocalHeader,
  hasZipEocd,
  ZIP_EOCD_SCAN_BYTES,
} from "./zipIntegrity";

/** Minimal EOCD record: signature + 18 zero bytes (empty archive, no comment). */
function eocd(): Uint8Array {
  const buf = new Uint8Array(22);
  buf.set([0x50, 0x4b, 0x05, 0x06]);
  return buf;
}

test("local header signature: accepts PK\\x03\\x04, rejects others", () => {
  assert.equal(hasZipLocalHeader(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), true);
  // A bare EOCD (empty archive) is not an acceptable upload
  assert.equal(hasZipLocalHeader(new Uint8Array([0x50, 0x4b, 0x05, 0x06])), false);
  // RIFF (a WAV renamed to .zip)
  assert.equal(hasZipLocalHeader(new Uint8Array([0x52, 0x49, 0x46, 0x46])), false);
  assert.equal(hasZipLocalHeader(new Uint8Array([])), false);
  assert.equal(hasZipLocalHeader(new Uint8Array([0x50, 0x4b])), false);
});

test("EOCD at the very end of the tail is found", () => {
  assert.equal(hasZipEocd(eocd()), true);
  // Preceded by arbitrary entry data
  const tail = new Uint8Array(1000);
  tail.set(eocd(), tail.length - 22);
  assert.equal(hasZipEocd(tail), true);
});

test("EOCD followed by an archive comment is found", () => {
  const comment = 512;
  const tail = new Uint8Array(1000 + comment);
  tail.set(eocd(), 1000 - 22);
  assert.equal(hasZipEocd(tail), true);
});

test("truncated archive (no EOCD anywhere) is rejected", () => {
  // The observed failure: valid-looking compressed data, cut off mid-entry
  const tail = new Uint8Array(ZIP_EOCD_SCAN_BYTES).fill(0xaa);
  assert.equal(hasZipEocd(tail), false);
  assert.equal(hasZipEocd(new Uint8Array([])), false);
  // Signature must have room for the full 22-byte record after it
  const cut = new Uint8Array([0x50, 0x4b, 0x05, 0x06]);
  assert.equal(hasZipEocd(cut), false);
});

test("partial signature bytes do not false-positive", () => {
  const tail = new Uint8Array(100);
  // "PK" pairs scattered without the full EOCD signature
  tail.set([0x50, 0x4b, 0x05, 0x05], 10);
  tail.set([0x50, 0x4b, 0x06, 0x06], 40);
  assert.equal(hasZipEocd(tail), false);
});
