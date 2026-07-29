import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputConfigPath = resolve(
  process.cwd(),
  "src-tauri/tauri.local-release.conf.json",
);
const updaterPublicKeyPath = resolve(
  process.cwd(),
  "../.release/nytemode-updater.pub",
);

const version = process.env.NYTEMODE_LOCAL_VERSION?.trim();
const updaterEndpoint = process.env.BUZZ_UPDATER_ENDPOINT?.trim();
const updaterPublicKey = readFileSync(updaterPublicKeyPath, "utf8").trim();

if (
  !version ||
  !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(version)
) {
  console.error(
    "Error: NYTEMODE_LOCAL_VERSION must be a complete SemVer version",
  );
  process.exit(1);
}

if (!updaterEndpoint) {
  console.error("Error: BUZZ_UPDATER_ENDPOINT is required");
  process.exit(1);
}

const endpoint = new URL(updaterEndpoint);
if (
  endpoint.protocol !== "http:" ||
  endpoint.hostname !== "127.0.0.1" ||
  endpoint.pathname !== "/latest.json" ||
  endpoint.search ||
  endpoint.hash
) {
  console.error(
    "Error: local updater endpoint must be loopback HTTP at /latest.json",
  );
  process.exit(1);
}

const releaseConfig = {
  version,
  bundle: {
    macOS: {
      minimumSystemVersion: "10.15",
    },
  },
  plugins: {
    updater: {
      pubkey: updaterPublicKey,
      endpoints: [updaterEndpoint],
      dangerousInsecureTransportProtocol: true,
    },
  },
};

writeFileSync(outputConfigPath, `${JSON.stringify(releaseConfig, null, 2)}\n`);
console.log(`Local updater enabled -> ${updaterEndpoint}`);
console.log(`Local build version -> ${version}`);
console.log(`Wrote ${outputConfigPath}`);
