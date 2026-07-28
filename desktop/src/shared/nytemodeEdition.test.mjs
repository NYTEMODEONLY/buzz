import assert from "node:assert/strict";
import test from "node:test";

import {
  NYTEMODE_EDITION_NAME,
  NYTEMODE_EDITION_URL,
  NYTEMODE_RELEASES_URL,
} from "./nytemodeEdition.ts";

test("nytemode edition owns its attribution and update channel", () => {
  assert.equal(NYTEMODE_EDITION_NAME, "nytemode edition");
  assert.equal(NYTEMODE_EDITION_URL, "https://nytemode.dev");
  assert.equal(
    NYTEMODE_RELEASES_URL,
    "https://github.com/NYTEMODEONLY/buzz/releases/latest",
  );
});
