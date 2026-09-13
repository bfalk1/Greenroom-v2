import { test } from "node:test";
import assert from "node:assert/strict";
import { isFlagged, parseWavDurationSec, MIN_SCANNABLE_SEC, FLAG_MIN_PROBABILITY } from "./aiScan";

function wavBuffer(seconds: number, sampleRate = 44100, channels = 2, extraChunk = false): Buffer {
  const byteRate = sampleRate * channels * 2;
  const dataSize = Math.round(seconds * byteRate);
  const chunks: Buffer[] = [];

  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "ascii");
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8); // PCM
  fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE(byteRate, 16);
  fmt.writeUInt16LE(channels * 2, 20);
  fmt.writeUInt16LE(16, 22);
  chunks.push(fmt);

  if (extraChunk) {
    // LIST chunk between fmt and data, as many DAW exports have
    const list = Buffer.alloc(8 + 26);
    list.write("LIST", 0, "ascii");
    list.writeUInt32LE(26, 4);
    chunks.push(list);
  }

  const dataHeader = Buffer.alloc(8);
  dataHeader.write("data", 0, "ascii");
  dataHeader.writeUInt32LE(dataSize, 4);
  chunks.push(dataHeader); // data payload deliberately absent — header parse only

  const body = Buffer.concat(chunks);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(4 + body.length + dataSize, 4);
  riff.write("WAVE", 8, "ascii");
  return Buffer.concat([riff, body]);
}

test("parseWavDurationSec reads duration from the header alone", () => {
  const d = parseWavDurationSec(wavBuffer(6.4));
  assert.ok(d !== null && Math.abs(d - 6.4) < 0.01, `got ${d}`);
});

test("parseWavDurationSec walks past intermediate chunks", () => {
  const d = parseWavDurationSec(wavBuffer(1.5, 48000, 1, true));
  assert.ok(d !== null && Math.abs(d - 1.5) < 0.01, `got ${d}`);
});

test("parseWavDurationSec rejects non-WAV bytes", () => {
  assert.equal(parseWavDurationSec(Buffer.from("ID3\x04not a wav at all, promise")), null);
  assert.equal(parseWavDurationSec(Buffer.alloc(10)), null);
});

test("flag policy: calibrated thresholds", () => {
  // the five known-AI stems from calibration all pass
  assert.equal(isFlagged("ai_generated", 83.55, 6.1), true);
  assert.equal(isFlagged("ai_generated", 91.12, 3.2), true);
  // sub-3s clips never flag, whatever the probability (0.6s stab hit ai@86)
  assert.equal(isFlagged("ai_generated", 86.36, 0.6), false);
  // low-probability ai_generated does not flag (1.7s glitch hit ai@50)
  assert.equal(isFlagged("ai_generated", 50.26, 5), false);
  // boundary values are inclusive
  assert.equal(isFlagged("ai_generated", FLAG_MIN_PROBABILITY, MIN_SCANNABLE_SEC), true);
  // non-AI verdicts never flag
  assert.equal(isFlagged("human", 95, 10), false);
  assert.equal(isFlagged("no_music", 100, 10), false);
  assert.equal(isFlagged(null, 100, 10), false);
  // missing duration/probability fail closed (no flag)
  assert.equal(isFlagged("ai_generated", null, 10), false);
  assert.equal(isFlagged("ai_generated", 95, null), false);
});
