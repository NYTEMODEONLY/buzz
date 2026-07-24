import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputConfigPath = resolve(
  process.cwd(),
  "src-tauri/tauri.canary-release.conf.json",
);

const updaterPubkey = process.env.BUZZ_CANARY_UPDATER_PUBLIC_KEY;
const updaterEndpoint = process.env.BUZZ_CANARY_UPDATER_ENDPOINT;
const expectedEndpoint =
  "https://github.com/NYTEMODEONLY/buzz/releases/download/buzz-canary-latest/latest.json";

const missing = [];
if (!updaterPubkey) missing.push("BUZZ_CANARY_UPDATER_PUBLIC_KEY");
if (!updaterEndpoint) missing.push("BUZZ_CANARY_UPDATER_ENDPOINT");
if (missing.length > 0) {
  console.error(
    `Error: required environment variable(s) missing: ${missing.join(", ")}`,
  );
  process.exit(1);
}

if (updaterEndpoint !== expectedEndpoint) {
  console.error(
    `Error: Canary updater endpoint must be ${expectedEndpoint}; got ${updaterEndpoint}`,
  );
  process.exit(1);
}

const releaseConfig = {
  productName: "Buzz Canary",
  identifier: "com.nytemode.buzz.canary",
  bundle: {
    macOS: {
      minimumSystemVersion: "10.15",
    },
    createUpdaterArtifacts: true,
  },
  plugins: {
    updater: {
      pubkey: updaterPubkey,
      endpoints: [updaterEndpoint],
    },
    "deep-link": {
      desktop: {
        schemes: ["buzz-canary"],
      },
    },
  },
};

const serializedConfig = JSON.stringify(releaseConfig, null, 2).replace(
  /"schemes": \[\n\s+"buzz-canary"\n\s+\]/,
  '"schemes": ["buzz-canary"]',
);
writeFileSync(outputConfigPath, `${serializedConfig}\n`);
console.log(`Canary updater enabled -> ${updaterEndpoint}`);
console.log(`Wrote ${outputConfigPath}`);
