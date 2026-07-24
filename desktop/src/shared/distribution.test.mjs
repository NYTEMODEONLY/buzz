import assert from "node:assert/strict";
import test from "node:test";

const {
  isNytemodeCanaryDistribution,
  NYTEMODE_CANARY_RELEASES_URL,
  releasesUrlForDistribution,
  UPSTREAM_RELEASES_URL,
} = await import("./distribution.ts");

test("identifies only the nytemode Canary distribution", () => {
  assert.equal(isNytemodeCanaryDistribution("nytemode-canary"), true);
  assert.equal(isNytemodeCanaryDistribution("canary"), false);
  assert.equal(isNytemodeCanaryDistribution(undefined), false);
});

test("routes manual updates to the owning distribution", () => {
  assert.equal(
    releasesUrlForDistribution("nytemode-canary"),
    NYTEMODE_CANARY_RELEASES_URL,
  );
  assert.equal(releasesUrlForDistribution(undefined), UPSTREAM_RELEASES_URL);
});
