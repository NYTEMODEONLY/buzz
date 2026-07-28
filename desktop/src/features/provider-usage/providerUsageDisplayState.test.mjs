import assert from "node:assert/strict";
import test from "node:test";

import {
  providerUsageErrorMessage,
  providerUsageViewState,
} from "./providerUsageDisplay.mjs";

test("classifies ordinary capability gaps without presenting them as errors", () => {
  assert.equal(
    providerUsageViewState({ availability: "unsupported" }),
    "unavailable",
  );
  assert.equal(
    providerUsageViewState({ availability: "not_authenticated" }),
    "authRequired",
  );
  assert.equal(
    providerUsageViewState({ availability: "not_installed" }),
    "notInstalled",
  );
});

test("retains last-good data as stale after an isolated refresh failure", () => {
  assert.equal(
    providerUsageViewState({
      availability: "available",
      hasData: true,
      isError: true,
    }),
    "stale",
  );
  assert.equal(
    providerUsageViewState({
      availability: "available",
      hasData: false,
      isError: true,
    }),
    "error",
  );
});

test("maps expected runtime codes back to neutral or setup states", () => {
  assert.equal(
    providerUsageViewState({
      availability: "available",
      error: new Error("grok_not_authenticated"),
      isError: true,
    }),
    "authRequired",
  );
  assert.equal(
    providerUsageViewState({
      availability: "available",
      error: new Error("grok_usage_method_unavailable"),
      isError: true,
    }),
    "unavailable",
  );
  assert.equal(
    providerUsageViewState({
      availability: "available",
      error: new Error("grok_team_usage_unsupported"),
      isError: true,
    }),
    "unavailable",
  );
});

test("maps Grok capability and authentication codes without raw detail", () => {
  assert.equal(
    providerUsageErrorMessage("grok_not_authenticated:/Users/alice", "Grok"),
    "Sign in with Grok to show usage",
  );
  assert.equal(
    providerUsageErrorMessage("grok_usage_method_unavailable:-32601", "Grok"),
    "This Grok installation does not expose consumer allowance",
  );
  assert.equal(
    providerUsageErrorMessage("grok_team_usage_unsupported:secret", "Grok"),
    "This Grok team account does not expose consumer allowance",
  );
});
