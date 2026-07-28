import assert from "node:assert/strict";
import test from "node:test";

import {
  applyExternalAgentPresentationToProfile,
  applyExternalAgentPresentationsToUsersBatch,
  externalAgentPresentationScope,
  formatExternalAgentRuntimeLabel,
} from "./externalAgentPresentation.ts";

const alicePubkey = "a".repeat(64);
const presentation = {
  [alicePubkey]: {
    displayName: "ALICE",
    avatarUrl: "https://example.com/alice.png",
    about: "Hermes research agent",
    runtimeLabel: "Hermes ACP",
  },
};

test("presentation scope is isolated by normalized owner and relay", () => {
  assert.equal(
    externalAgentPresentationScope({
      identityPubkey: "ABC",
      relayUrl: "WSS://RELAY.EXAMPLE",
    }),
    "abc:wss://relay.example",
  );
  assert.equal(
    externalAgentPresentationScope({
      identityPubkey: "",
      relayUrl: "wss://relay.example",
    }),
    null,
  );
});

test("profile presentation changes Buzz fields without changing identity or ownership", () => {
  const profile = {
    pubkey: alicePubkey,
    displayName: "Alice",
    avatarUrl: null,
    about: "Host profile",
    nip05Handle: null,
    ownerPubkey: "b".repeat(64),
    hasProfileEvent: true,
  };
  const presented = applyExternalAgentPresentationToProfile(
    alicePubkey.toUpperCase(),
    profile,
    presentation,
  );

  assert.equal(presented.displayName, "ALICE");
  assert.equal(presented.avatarUrl, "https://example.com/alice.png");
  assert.equal(presented.about, "Hermes research agent");
  assert.equal(presented.pubkey, alicePubkey);
  assert.equal(presented.ownerPubkey, profile.ownerPubkey);
  assert.equal(presented.hasProfileEvent, true);
});

test("batch presentation preserves verified agent and owner metadata", () => {
  const source = {
    profiles: {
      [alicePubkey]: {
        displayName: "Alice",
        name: "alice",
        avatarUrl: null,
        nip05Handle: null,
        ownerPubkey: "b".repeat(64),
        isAgent: true,
      },
    },
    missing: [],
  };
  const presented = applyExternalAgentPresentationsToUsersBatch(
    source,
    presentation,
  );
  const alice = presented.profiles[alicePubkey];

  assert.equal(alice.displayName, "ALICE");
  assert.equal(alice.avatarUrl, "https://example.com/alice.png");
  assert.equal(alice.ownerPubkey, source.profiles[alicePubkey].ownerPubkey);
  assert.equal(alice.isAgent, true);
});

test("runtime labels are display-only, normalized, and generic values stay hidden", () => {
  assert.equal(formatExternalAgentRuntimeLabel("hermes-acp"), "HERMES");
  assert.equal(formatExternalAgentRuntimeLabel(" Hermes "), "HERMES");
  assert.equal(formatExternalAgentRuntimeLabel("codex"), "CODEX");
  assert.equal(formatExternalAgentRuntimeLabel("agent"), null);
  assert.equal(formatExternalAgentRuntimeLabel(null), null);
});
