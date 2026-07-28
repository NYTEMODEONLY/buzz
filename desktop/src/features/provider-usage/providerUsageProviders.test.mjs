import assert from "node:assert/strict";
import test from "node:test";

import { detectActiveProviderUsageIds } from "./providerUsageProviders.mjs";

test("shows every provider used by active agents in stable order", () => {
  assert.deepEqual(
    detectActiveProviderUsageIds([
      {
        status: "running",
        runtime: "grok",
        model: "Grok 4.5",
      },
      {
        status: "running",
        agentCommand: "codex-acp",
      },
      {
        status: "stopped",
        provider: "anthropic",
      },
    ]),
    ["codex", "grok"],
  );
});

test("falls back to every available local reader when metadata is inherited", () => {
  assert.deepEqual(
    detectActiveProviderUsageIds(
      [{ status: "running", provider: null, runtime: null }],
      [
        { id: "grok", availability: "unsupported" },
        { id: "codex", availability: "available" },
      ],
    ),
    ["codex"],
  );
});

test("keeps a deterministic Codex surface while queries load", () => {
  assert.deepEqual(detectActiveProviderUsageIds(), ["codex"]);
});
