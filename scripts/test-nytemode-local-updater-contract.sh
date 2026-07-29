#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
script="$repo_root/scripts/nytemode-local-updater.sh"
generator="$repo_root/desktop/scripts/build-nytemode-local-release-config.mjs"
public_key="$repo_root/.release/nytemode-updater.pub"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

[[ -x "$script" ]] || {
  echo "local updater script must be executable" >&2
  exit 1
}
[[ -s "$public_key" ]]

mkdir -p "$tmp/desktop/src-tauri" "$tmp/.release"
cp "$public_key" "$tmp/.release/nytemode-updater.pub"
(
  cd "$tmp/desktop"
  NYTEMODE_LOCAL_VERSION=1.2.3-nytemode.4 \
    BUZZ_UPDATER_ENDPOINT=http://127.0.0.1:54127/latest.json \
    node "$generator"
)

config="$tmp/desktop/src-tauri/tauri.local-release.conf.json"
node -e '
  const fs = require("fs");
  const config = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (config.version !== "1.2.3-nytemode.4") process.exit(1);
  const updater = config.plugins.updater;
  if (updater.endpoints[0] !== "http://127.0.0.1:54127/latest.json") process.exit(1);
  if (updater.dangerousInsecureTransportProtocol !== true) process.exit(1);
  if (!updater.pubkey) process.exit(1);
' "$config"

if (
  cd "$tmp/desktop"
  NYTEMODE_LOCAL_VERSION=1.2.3-nytemode.4 \
    BUZZ_UPDATER_ENDPOINT=https://example.com/latest.json \
    node "$generator"
); then
  echo "local updater accepted a non-loopback endpoint" >&2
  exit 1
fi

grep -Fq 'source worktree must be clean before a local updater build' "$script"
grep -Fq 'canonical_public_key "$committed_public_key"' "$script"
grep -Fq 'canonical_public_key "$local_public_key"' "$script"
grep -Fq 'public_key_sha256 "$committed_public_key"' "$script"
grep -Fq 'darwin-aarch64' "$script"
grep -Fq 'COPYFILE_DISABLE=1 /usr/bin/tar -czf' "$script"
grep -Fq 'updater archive contains AppleDouble metadata entries' "$script"
grep -Fq 'mv "$manifest_tmp" "$feed_root/latest.json"' "$script"
grep -Fq 'quit it explicitly before installation' "$script"
grep -Fq 'codesign --verify --deep --strict' "$script"
grep -Fq 'TAURI_SIGNING_PRIVATE_KEY' "$repo_root/.gitignore" && {
  echo "gitignore unexpectedly contains a signing secret value" >&2
  exit 1
} || true

echo "nytemode local updater contract passed"
