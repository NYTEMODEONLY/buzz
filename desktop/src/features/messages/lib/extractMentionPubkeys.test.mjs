import assert from "node:assert/strict";
import test from "node:test";

import { extractMentionPubkeysFromCandidates } from "./extractMentionPubkeys.ts";

const PUB_A = "1".repeat(64);
const PUB_B = "2".repeat(64);

function candidate(pubkey, overrides = {}) {
  return {
    displayName: "XENA",
    isMember: true,
    pubkey,
    ...overrides,
  };
}

test("explicit picker identity remains exact when member names conflict", () => {
  assert.deepEqual(
    extractMentionPubkeysFromCandidates({
      candidates: [candidate(PUB_A), candidate(PUB_B)],
      explicitMentions: new Map([["XENA", PUB_B]]),
      personaMentionNames: [],
      text: "@XENA investigate",
    }),
    [PUB_B],
  );
});

test("plain typed member name resolves when it has one eligible pubkey", () => {
  assert.deepEqual(
    extractMentionPubkeysFromCandidates({
      candidates: [candidate(PUB_A)],
      explicitMentions: new Map(),
      personaMentionNames: [],
      text: "@XENA investigate",
    }),
    [PUB_A],
  );
});

test("plain typed member name fails closed when eligible pubkeys conflict", () => {
  assert.deepEqual(
    extractMentionPubkeysFromCandidates({
      candidates: [candidate(PUB_A), candidate(PUB_B, { isMember: false })],
      explicitMentions: new Map(),
      personaMentionNames: [],
      text: "@XENA investigate",
    }),
    [],
  );
});

test("duplicate sources for one pubkey do not create false ambiguity", () => {
  assert.deepEqual(
    extractMentionPubkeysFromCandidates({
      candidates: [candidate(PUB_A), candidate(PUB_A)],
      explicitMentions: new Map(),
      personaMentionNames: [],
      text: "@XENA investigate",
    }),
    [PUB_A],
  );
});
