import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const expectedVersion = process.argv[2];

if (
  !expectedVersion ||
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expectedVersion)
) {
  console.error(
    "Usage: node desktop/scripts/verify-release-version.mjs <semver>",
  );
  process.exit(2);
}

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(resolve(desktopDir, relativePath), "utf8");
}

function requireVersion(label, actualVersion) {
  if (actualVersion !== expectedVersion) {
    console.error(
      `Error: ${label} version is ${actualVersion ?? "<missing>"}, expected ${expectedVersion}`,
    );
    process.exit(1);
  }
}

function packageVersion(toml, packageName) {
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const packageBlock = toml.match(
    new RegExp(
      String.raw`\[\[package\]\]\s+name = "${escapedName}"\s+version = "([^"]+)"`,
      "m",
    ),
  );
  return packageBlock?.[1];
}

const packageJson = JSON.parse(read("package.json"));
const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json"));
const cargoToml = read("src-tauri/Cargo.toml");
const cargoLock = read("src-tauri/Cargo.lock");

requireVersion("desktop/package.json", packageJson.version);
requireVersion("desktop/src-tauri/tauri.conf.json", tauriConfig.version);
requireVersion(
  "desktop/src-tauri/Cargo.toml",
  cargoToml.match(/^\[package\][\s\S]*?^version = "([^"]+)"/m)?.[1],
);
requireVersion(
  "desktop/src-tauri/Cargo.lock buzz-desktop package",
  packageVersion(cargoLock, "buzz-desktop"),
);

console.log(`Verified synchronized desktop release version ${expectedVersion}`);
