import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupModerationByCreator,
  moderationTitle,
} from "./notificationFormat";

test("single item gets a named title and direct context id", () => {
  const rows = groupModerationByCreator("sample", "approved", [
    { id: "s1", name: "Deep Kick", creatorId: "c1" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, "c1");
  assert.equal(rows[0].type, "SAMPLE_APPROVED");
  assert.equal(rows[0].title, 'Your sample "Deep Kick" was approved');
  assert.equal(rows[0].contextType, "Sample");
  assert.equal(rows[0].contextId, "s1");
  assert.deepEqual(rows[0].metadata, {
    count: 1,
    itemNames: ["Deep Kick"],
    itemIds: ["s1"],
  });
});

test("bulk moderation folds to one row per creator", () => {
  const items = [
    { id: "s1", name: "A", creatorId: "c1" },
    { id: "s2", name: "B", creatorId: "c2" },
    { id: "s3", name: "C", creatorId: "c1" },
    { id: "s4", name: "D", creatorId: "c1" },
  ];
  const rows = groupModerationByCreator("sample", "rejected", items);
  assert.equal(rows.length, 2);

  const c1 = rows.find((r) => r.userId === "c1")!;
  assert.equal(c1.type, "SAMPLE_REJECTED");
  assert.equal(c1.title, "3 of your samples were not approved");
  // Multi-item groups don't point at a single item.
  assert.equal(c1.contextId, null);
  assert.deepEqual(c1.metadata, {
    count: 3,
    itemNames: ["A", "C", "D"],
    itemIds: ["s1", "s3", "s4"],
  });

  const c2 = rows.find((r) => r.userId === "c2")!;
  assert.equal(c2.title, 'Your sample "B" was not approved');
});

test("itemNames caps at five, itemIds keeps all", () => {
  const items = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i}`,
    name: `Preset ${i}`,
    creatorId: "c1",
  }));
  const rows = groupModerationByCreator("preset", "removed", items);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "PRESET_REMOVED");
  const meta = rows[0].metadata as {
    count: number;
    itemNames: string[];
    itemIds: string[];
  };
  assert.equal(meta.count, 8);
  assert.equal(meta.itemNames.length, 5);
  assert.equal(meta.itemIds.length, 8);
});

test("items without a creator are skipped", () => {
  const rows = groupModerationByCreator("sample", "approved", [
    { id: "s1", name: "A", creatorId: "" },
  ]);
  assert.equal(rows.length, 0);
});

test("moderation titles read naturally across kinds and actions", () => {
  assert.equal(
    moderationTitle("preset", "approved", 1, "Warm Pad"),
    'Your preset "Warm Pad" was approved'
  );
  assert.equal(
    moderationTitle("preset", "rejected", 2),
    "2 of your presets were not approved"
  );
  assert.equal(
    moderationTitle("sample", "removed", 1),
    "Your sample was removed"
  );
});
