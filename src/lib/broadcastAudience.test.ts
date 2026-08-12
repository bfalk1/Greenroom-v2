import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SPECIFIC_RECIPIENTS,
  audienceLabel,
  audienceWhere,
  isBroadcastAudience,
  parseAudience,
} from "./broadcastAudience";

test("every audience excludes suspended accounts", () => {
  assert.equal(audienceWhere("ALL").isActive, true);
  assert.equal(audienceWhere("CREATORS").isActive, true);
  assert.equal(audienceWhere("USERS").isActive, true);
  assert.equal(audienceWhere("SPECIFIC", ["u1"]).isActive, true);
});

test("role audiences don't overlap", () => {
  assert.equal(audienceWhere("CREATORS").role, "CREATOR");
  // Members means plain USER — staff and creators must not be swept in.
  assert.equal(audienceWhere("USERS").role, "USER");
  assert.equal(audienceWhere("ALL").role, undefined);
});

test("specific targeting scopes to the given ids", () => {
  assert.deepEqual(audienceWhere("SPECIFIC", ["a", "b"]).id, {
    in: ["a", "b"],
  });
});

test("a missing audience keeps the old creators-only behaviour", () => {
  assert.deepEqual(parseAudience(undefined, undefined), {
    ok: true,
    audience: "CREATORS",
    userIds: [],
  });
});

test("unknown audiences are rejected", () => {
  assert.equal(parseAudience("EVERYONE", undefined).ok, false);
  assert.equal(parseAudience(7, undefined).ok, false);
  assert.equal(isBroadcastAudience("STAFF"), false);
  assert.equal(isBroadcastAudience("ALL"), true);
});

test("specific targeting requires a usable id list", () => {
  assert.equal(parseAudience("SPECIFIC", undefined).ok, false);
  assert.equal(parseAudience("SPECIFIC", []).ok, false);
  // Non-strings are dropped, and dropping them all is still empty.
  assert.equal(parseAudience("SPECIFIC", [1, null]).ok, false);

  const tooMany = parseAudience(
    "SPECIFIC",
    Array.from({ length: MAX_SPECIFIC_RECIPIENTS + 1 }, (_, i) => `u${i}`)
  );
  assert.equal(tooMany.ok, false);
});

test("specific recipient ids are de-duplicated", () => {
  const parsed = parseAudience("SPECIFIC", ["a", "b", "a"]);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok && parsed.userIds, ["a", "b"]);
});

test("labels pluralize", () => {
  assert.equal(audienceLabel("CREATORS", 1), "1 approved creator");
  assert.equal(audienceLabel("CREATORS", 2), "2 approved creators");
  assert.equal(audienceLabel("ALL", 0), "0 active accounts");
  assert.equal(audienceLabel("SPECIFIC", 1), "1 selected recipient");
});
