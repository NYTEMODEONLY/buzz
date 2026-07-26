import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MANUAL_ORDER_STORE,
  mergeDeletedSectionOrder,
  moveManualChannel,
  normalizeManualOrder,
  parseChannelManualOrderPayload,
  pruneManualOrderGroups,
  setManualGroupOrder,
} from "./channelManualOrder.ts";

test("parse validates groups, removes duplicates, and ignores malformed values", () => {
  assert.deepEqual(
    parseChannelManualOrderPayload({
      version: 1,
      groups: {
        channels: ["a", "a", 42, "b"],
        "section:work": ["c"],
        broken: "nope",
      },
    }),
    {
      version: 1,
      groups: { channels: ["a", "b"], "section:work": ["c"] },
      manualGroups: [],
    },
  );
  assert.equal(parseChannelManualOrderPayload({ version: 2 }), null);
  assert.equal(parseChannelManualOrderPayload(null), null);
});

test("parse bounds oversized remote groups and channel lists", () => {
  const oversizedGroups = {
    channels: Array.from({ length: 10_050 }, (_, index) => `channel-${index}`),
    ...Object.fromEntries(
      Array.from({ length: 1_050 }, (_, index) => [
        `section:${index}`,
        [`channel-${index}`],
      ]),
    ),
  };
  const parsed = parseChannelManualOrderPayload({
    version: 1,
    groups: oversizedGroups,
  });
  assert.ok(parsed);
  assert.equal(Object.keys(parsed.groups).length, 1_000);
  assert.equal(parsed.groups.channels.length, 10_000);
});

test("normalize keeps saved live ids, drops stale ids, and appends new ids", () => {
  assert.deepEqual(
    normalizeManualOrder(["b", "stale", "b", "a"], ["a", "b", "c"]),
    ["b", "a", "c"],
  );
});

test("set order deduplicates ids without changing other groups", () => {
  const next = setManualGroupOrder(
    {
      version: 1,
      groups: { "section:work": ["x"] },
      manualGroups: [],
    },
    "channels",
    ["b", "a", "b"],
  );
  assert.deepEqual(next.groups, {
    "section:work": ["x"],
    channels: ["b", "a"],
  });
});

test("move within a group inserts before the hovered channel", () => {
  const next = moveManualChannel(
    {
      version: 1,
      groups: { channels: ["a", "b", "c"] },
      manualGroups: [],
    },
    {
      channelId: "c",
      sourceGroup: "channels",
      targetGroup: "channels",
      overChannelId: "a",
      sourceLiveIds: ["a", "b", "c"],
      targetLiveIds: ["a", "b", "c"],
    },
  );
  assert.deepEqual(next.groups.channels, ["c", "a", "b"]);
});

test("move within a group follows the hovered index in both directions", () => {
  const store = {
    version: 1,
    groups: { channels: ["a", "b", "c", "d"] },
    manualGroups: ["channels"],
  };
  const down = moveManualChannel(store, {
    channelId: "a",
    sourceGroup: "channels",
    targetGroup: "channels",
    overChannelId: "c",
    sourceLiveIds: ["a", "b", "c", "d"],
    targetLiveIds: ["a", "b", "c", "d"],
  });
  assert.deepEqual(down.groups.channels, ["b", "c", "a", "d"]);
  const last = moveManualChannel(store, {
    channelId: "a",
    sourceGroup: "channels",
    targetGroup: "channels",
    overChannelId: "d",
    sourceLiveIds: ["a", "b", "c", "d"],
    targetLiveIds: ["a", "b", "c", "d"],
  });
  assert.deepEqual(last.groups.channels, ["b", "c", "d", "a"]);
});

test("move across groups removes from source and inserts into target", () => {
  const next = moveManualChannel(
    {
      version: 1,
      groups: {
        channels: ["a", "b"],
        "section:work": ["c", "d"],
      },
      manualGroups: [],
    },
    {
      channelId: "b",
      sourceGroup: "channels",
      targetGroup: "section:work",
      overChannelId: "d",
      sourceLiveIds: ["a", "b"],
      targetLiveIds: ["c", "d"],
    },
  );
  assert.deepEqual(next.groups.channels, ["a"]);
  assert.deepEqual(next.groups["section:work"], ["c", "b", "d"]);
});

test("deleting a section appends its visible order to Channels and prunes its mode", () => {
  const next = mergeDeletedSectionOrder(
    {
      version: 1,
      groups: {
        channels: ["a", "b"],
        "section:work": ["d", "c"],
      },
      manualGroups: ["channels", "section:work"],
    },
    "work",
    ["d", "c"],
    ["a", "b"],
  );
  assert.deepEqual(next.groups, { channels: ["a", "b", "d", "c"] });
  assert.deepEqual(next.manualGroups, ["channels"]);
});

test("pruning keeps only Channels and live custom section groups", () => {
  const store = {
    version: 1,
    groups: {
      channels: ["a"],
      "section:work": ["b"],
      "section:deleted": ["c"],
      dms: ["d"],
    },
    manualGroups: ["channels", "section:work", "section:deleted"],
  };
  assert.deepEqual(pruneManualOrderGroups(store, ["work"]).groups, {
    channels: ["a"],
    "section:work": ["b"],
  });
  assert.deepEqual(pruneManualOrderGroups(store, ["work"]).manualGroups, [
    "channels",
    "section:work",
  ]);
  assert.equal(
    pruneManualOrderGroups(DEFAULT_MANUAL_ORDER_STORE, []),
    DEFAULT_MANUAL_ORDER_STORE,
  );
});
