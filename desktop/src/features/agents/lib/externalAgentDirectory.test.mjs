import assert from "node:assert/strict";
import test from "node:test";

import {
  externalRelayAgents,
  formatExternalAgentType,
} from "./externalAgentDirectory.ts";

const relayAgent = (overrides) => ({
  pubkey: "a".repeat(64),
  name: "Agent",
  avatarUrl: null,
  ownerPubkey: "b".repeat(64),
  isOwnerManaged: false,
  agentType: "agent",
  channels: [],
  channelIds: [],
  capabilities: [],
  status: "online",
  respondTo: "owner-only",
  respondToAllowlist: [],
  ...overrides,
});

test("shows only truly external relay agents across isolated installs", () => {
  const muse = relayAgent({
    pubkey: "1".repeat(64),
    name: "MUSE",
    isOwnerManaged: true,
  });
  const xena = relayAgent({
    pubkey: "2".repeat(64),
    name: "XENA",
    isOwnerManaged: true,
  });
  const zoey = relayAgent({
    pubkey: "3".repeat(64),
    name: "ZOEY",
    isOwnerManaged: true,
  });
  const alice = relayAgent({
    pubkey: "4".repeat(64),
    name: "ALICE",
    agentType: "hermes",
  });

  assert.deepEqual(
    externalRelayAgents([muse, xena, zoey, alice], new Set(), new Set()),
    [alice],
  );
});

test("also excludes agents managed by this local installation", () => {
  const local = relayAgent({ pubkey: "A".repeat(64) });
  assert.deepEqual(
    externalRelayAgents([local], new Set(["a".repeat(64)]), new Set()),
    [],
  );
});

test("deduplicates an archived managed coordinate by its local card name", () => {
  const staleMuseDirectoryEntry = relayAgent({
    pubkey: "1".repeat(64),
    name: "MUSE",
  });
  const alice = relayAgent({
    pubkey: "2".repeat(64),
    name: "ALICE",
    agentType: "hermes",
  });

  assert.deepEqual(
    externalRelayAgents(
      [staleMuseDirectoryEntry, alice],
      new Set(),
      new Set([" muse "]),
    ),
    [alice],
  );
});

test("formats external runtime metadata for card labels", () => {
  assert.equal(formatExternalAgentType("hermes"), "Hermes");
  assert.equal(formatExternalAgentType("hermes-acp"), "Hermes");
  assert.equal(formatExternalAgentType("claude-agent-acp"), "Claude Agent");
  assert.equal(formatExternalAgentType("agent"), "External runtime");
});
