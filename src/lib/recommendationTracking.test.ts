import { test } from "node:test";
import assert from "node:assert/strict";
import { isImpressionId, toImpressionRow } from "./recommendationTracking";

const part = (id: string, n: number) => ({
  id,
  score: n,
  cfNorm: n / 2,
  supporters: 3,
  genreW: 1,
  subW: 0.25,
  creatorW: 0,
  ratingW: 0.5,
  damping: 1.5,
});

test("a scored list becomes one array per score part, aligned by position", () => {
  const row = toImpressionRow(
    false,
    { genre: "Dubstep", key: undefined, scale: "" },
    {
      ranker: "v1-hand-tuned",
      sampleIds: ["s1", "s2"],
      presetIds: ["p1"],
      sampleParts: [part("s1", 1), part("s2", 2)],
      presetParts: [part("p1", 3)],
    }
  );

  assert.equal(row.cold, false);
  assert.equal(row.ranker, "v1-hand-tuned");
  assert.deepEqual(row.filters, { genre: "Dubstep" });
  assert.deepEqual(row.sampleIds, ["s1", "s2"]);
  assert.deepEqual(row.sampleScores, [1, 2]);
  assert.deepEqual(row.sampleSimilarBuyers, [0.5, 1]);
  assert.deepEqual(row.sampleInstrument, [0.25, 0.25]);
  assert.deepEqual(row.sampleRating, [0.5, 0.5]);
  assert.deepEqual(row.samplePopularity, [1.5, 1.5]);
  assert.deepEqual(row.presetIds, ["p1"]);
  assert.deepEqual(row.presetCategory, [0.25]);
  for (const key of ["sampleGenre", "sampleCreator"] as const) {
    assert.equal(row[key].length, row.sampleIds.length);
  }
});

test("a cold-start list keeps its ids but has no score parts", () => {
  const row = toImpressionRow(true, {}, {
    ranker: "v1-hand-tuned",
    sampleIds: ["s1"],
    presetIds: [],
    sampleParts: [],
    presetParts: [],
  });

  assert.equal(row.cold, true);
  assert.deepEqual(row.sampleIds, ["s1"]);
  assert.deepEqual(row.sampleScores, []);
  assert.deepEqual(row.presetPopularity, []);
  assert.deepEqual(row.filters, {});
});

test("only uuid impression ids from the client are accepted", () => {
  assert.equal(isImpressionId("0f8fad5b-d9cb-469f-a165-70867728950e"), true);
  assert.equal(isImpressionId("not-a-uuid"), false);
  assert.equal(isImpressionId("0f8fad5b-d9cb-469f-a165-70867728950e; drop"), false);
  assert.equal(isImpressionId(42), false);
  assert.equal(isImpressionId(null), false);
  assert.equal(isImpressionId(undefined), false);
});
