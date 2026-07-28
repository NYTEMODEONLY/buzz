import assert from "node:assert/strict";
import test from "node:test";

import {
  activeAuthorizedManagedAgents,
  launchableLibraryPersonas,
  runnableLocalManagedAgents,
  withoutArchivedAgents,
} from "./managedAgentIdentitySafety.ts";

const relayAgent = (overrides = {}) => ({
  pubkey: "a".repeat(64),
  name: "Agent",
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

const managedAgent = (overrides = {}) => ({
  pubkey: "b".repeat(64),
  personaId: null,
  status: "stopped",
  ...overrides,
});

test("same-persona local sibling never receives runtime controls", () => {
  const canonicalPubkey = "1".repeat(64);
  const siblingPubkey = "2".repeat(64);
  const personaId = "persona:zero";
  const relay = [
    relayAgent({
      pubkey: canonicalPubkey,
      isOwnerManaged: true,
      ownerManagedPersonaId: personaId,
    }),
  ];
  const canonicalLocal = managedAgent({
    pubkey: canonicalPubkey,
    personaId,
  });
  const sibling = managedAgent({ pubkey: siblingPubkey, personaId });
  const custom = managedAgent({ pubkey: "3".repeat(64), personaId: null });

  assert.deepEqual(
    runnableLocalManagedAgents([canonicalLocal, sibling, custom], relay, true),
    [canonicalLocal, custom],
  );
});

test("persona controls fail closed until owner declarations resolve", () => {
  const personaAgent = managedAgent({ personaId: "persona:zero" });
  const custom = managedAgent({ pubkey: "3".repeat(64), personaId: null });

  assert.deepEqual(
    runnableLocalManagedAgents([personaAgent, custom], [], false),
    [custom],
  );
  assert.deepEqual(
    launchableLibraryPersonas([{ id: "persona:zero" }], [], false),
    [],
  );
});

test("owner-managed persona declaration suppresses replacement launch", () => {
  const relay = [
    relayAgent({
      isOwnerManaged: true,
      ownerManagedPersonaId: "persona:zero",
    }),
  ];

  assert.deepEqual(
    launchableLibraryPersonas(
      [{ id: "persona:zero" }, { id: "persona:helper" }],
      relay,
      true,
    ),
    [{ id: "persona:helper" }],
  );
});

test("settled archive snapshot suppresses exact agent pubkeys", () => {
  const archived = relayAgent({ pubkey: "a".repeat(64), name: "Archived" });
  const active = relayAgent({ pubkey: "b".repeat(64), name: "Active" });

  assert.deepEqual(
    withoutArchivedAgents([archived, active], new Set([archived.pubkey])),
    [active],
  );
});

test("bulk targets are selected only from the authorized identity-safe set", () => {
  const canonical = managedAgent({
    pubkey: "1".repeat(64),
    status: "running",
  });
  const stopped = managedAgent({
    pubkey: "2".repeat(64),
    status: "stopped",
  });
  const hiddenSibling = managedAgent({
    pubkey: "3".repeat(64),
    status: "running",
  });
  const authorized = [canonical, stopped];

  assert.deepEqual(activeAuthorizedManagedAgents(authorized), [canonical]);
  assert.ok(!activeAuthorizedManagedAgents(authorized).includes(hiddenSibling));
});
