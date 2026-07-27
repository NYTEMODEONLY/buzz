import assert from "node:assert/strict";
import test from "node:test";

import {
  externalRelayAgents,
  formatExternalAgentType,
  launchableLibraryPersonas,
  ownerManagedRelayAgents,
  ownerManagedPersonaIds,
  runnableLocalManagedAgents,
} from "./externalAgentDirectory.ts";

const relayAgent = (overrides) => ({
  pubkey: "a".repeat(64),
  name: "Agent",
  avatarUrl: null,
  ownerPubkey: "b".repeat(64),
  isOwnerManaged: false,
  ownerManagedPersonaId: null,
  agentType: "agent",
  channels: [],
  channelIds: [],
  capabilities: [],
  status: "online",
  respondTo: "owner-only",
  respondToAllowlist: [],
  ...overrides,
});

const managedAgent = (overrides) => ({
  pubkey: "c".repeat(64),
  personaId: null,
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

test("shows owner-managed agents from another isolated installation", () => {
  const muse = relayAgent({
    pubkey: "1".repeat(64),
    name: "MUSE",
    isOwnerManaged: true,
    ownerManagedPersonaId: "builtin:fizz",
  });
  const localXena = relayAgent({
    pubkey: "2".repeat(64),
    name: "XENA",
    isOwnerManaged: true,
    ownerManagedPersonaId: "builtin:honey",
  });
  const alice = relayAgent({
    pubkey: "3".repeat(64),
    name: "ALICE",
  });

  assert.deepEqual(
    ownerManagedRelayAgents(
      [muse, localXena, alice],
      new Set([localXena.pubkey]),
    ),
    [muse],
  );
});

test("keeps owner-managed canonical visible when a same-name local sibling exists", () => {
  const canonicalZero = relayAgent({
    pubkey: "a01c81071e15dc14e52eae1e169f1c684a3e2b4d9c2b63f0599aee9444a917ba",
    name: "ZERO",
    isOwnerManaged: true,
    ownerManagedPersonaId: "persona:zero-coding",
  });
  const siblingPubkey =
    "44531d553d20a29e9aabf806faa2aca8ee4715dd487e1bf00ba76a433c41b5aa";

  assert.deepEqual(
    ownerManagedRelayAgents([canonicalZero], new Set([siblingPubkey])),
    [canonicalZero],
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

test("owner-managed persona ids suppress replacement launch controls", () => {
  const muse = relayAgent({
    pubkey: "1".repeat(64),
    isOwnerManaged: true,
    ownerManagedPersonaId: "builtin:fizz",
  });
  const alice = relayAgent({
    pubkey: "2".repeat(64),
    ownerManagedPersonaId: "builtin:honey",
  });

  assert.deepEqual(
    ownerManagedPersonaIds([muse, alice]),
    new Set(["builtin:fizz"]),
  );
});

test("runnableLocalManagedAgents drops noncanonical same-persona siblings", () => {
  const canonicalPubkey =
    "a01c81071e15dc14e52eae1e169f1c684a3e2b4d9c2b63f0599aee9444a917ba";
  const siblingPubkey =
    "44531d553d20a29e9aabf806faa2aca8ee4715dd487e1bf00ba76a433c41b5aa";
  const personaId = "persona:zero-coding";
  const relay = [
    relayAgent({
      pubkey: canonicalPubkey,
      name: "ZERO",
      isOwnerManaged: true,
      ownerManagedPersonaId: personaId,
    }),
  ];
  const sibling = managedAgent({
    pubkey: siblingPubkey,
    personaId,
  });
  const custom = managedAgent({
    pubkey: "d".repeat(64),
    personaId: null,
  });
  const hostOfCanonical = managedAgent({
    pubkey: canonicalPubkey,
    personaId,
  });
  const unrelatedPersona = managedAgent({
    pubkey: "e".repeat(64),
    personaId: "persona:other",
  });

  assert.deepEqual(runnableLocalManagedAgents([sibling, custom], relay, true), [
    custom,
  ]);
  assert.deepEqual(
    runnableLocalManagedAgents(
      [hostOfCanonical, sibling, unrelatedPersona],
      relay,
      true,
    ),
    [hostOfCanonical, unrelatedPersona],
  );
});

test("runnableLocalManagedAgents fails closed until owner-managed declarations resolve", () => {
  const siblingPubkey =
    "44531d553d20a29e9aabf806faa2aca8ee4715dd487e1bf00ba76a433c41b5aa";
  const sibling = managedAgent({
    pubkey: siblingPubkey,
    personaId: "persona:zero-coding",
  });
  const custom = managedAgent({
    pubkey: "d".repeat(64),
    personaId: null,
  });

  // Empty relayAgents while unresolved must NOT be treated as "no owner-managed".
  assert.deepEqual(runnableLocalManagedAgents([sibling, custom], [], false), [
    custom,
  ]);
  // Even if partial data were present, unresolved still withholds persona locals.
  assert.deepEqual(
    runnableLocalManagedAgents(
      [sibling, custom],
      [
        relayAgent({
          pubkey:
            "a01c81071e15dc14e52eae1e169f1c684a3e2b4d9c2b63f0599aee9444a917ba",
          isOwnerManaged: true,
          ownerManagedPersonaId: "persona:zero-coding",
        }),
      ],
      false,
    ),
    [custom],
  );
});

test("launchableLibraryPersonas fails closed until owner-managed declarations resolve", () => {
  const personas = [
    { id: "persona:zero-coding" },
    { id: "persona:custom-helper" },
  ];
  assert.deepEqual(launchableLibraryPersonas(personas, [], false), []);
  assert.deepEqual(
    launchableLibraryPersonas(
      personas,
      [
        relayAgent({
          isOwnerManaged: true,
          ownerManagedPersonaId: "persona:zero-coding",
        }),
      ],
      true,
    ),
    [{ id: "persona:custom-helper" }],
  );
});

test("formats external runtime metadata for card labels", () => {
  assert.equal(formatExternalAgentType("hermes"), "Hermes");
  assert.equal(formatExternalAgentType("hermes-acp"), "Hermes");
  assert.equal(formatExternalAgentType("claude-agent-acp"), "Claude Agent");
  assert.equal(formatExternalAgentType("agent"), "External runtime");
});
