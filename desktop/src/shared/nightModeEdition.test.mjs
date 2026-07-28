import assert from "node:assert/strict";
import test from "node:test";

import {
  NIGHT_MODE_EDITION_NAME,
  NIGHT_MODE_EDITION_URL,
  NIGHT_MODE_RELEASES_URL,
} from "./nightModeEdition.ts";

test("NYTEMODE EDITION owns its attribution and update channel", () => {
  assert.equal(NIGHT_MODE_EDITION_NAME, "NYTEMODE EDITION");
  assert.equal(NIGHT_MODE_EDITION_URL, "https://nytemode.dev");
  assert.equal(
    NIGHT_MODE_RELEASES_URL,
    "https://github.com/NYTEMODEONLY/buzz/releases/latest",
  );
});
