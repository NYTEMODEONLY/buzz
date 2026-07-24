#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

grep -Fq 'com.nytemode.buzz.canary' "$repo_root/desktop/scripts/build-canary-release-config.mjs"
grep -Fq 'buzz-canary-latest/latest.json' "$repo_root/desktop/scripts/build-canary-release-config.mjs"
grep -Fq 'schemes: ["buzz-canary"]' "$repo_root/desktop/scripts/build-canary-release-config.mjs"
grep -Fq 'buzz-desktop-canary' "$repo_root/docs/CANARY.md"
grep -Fq 'BUZZ_DESKTOP_BUILD_KEYRING_SERVICE=buzz-desktop-canary' "$repo_root/docs/RELEASING_CANARY.md"
grep -Fq 'VITE_BUZZ_DISTRIBUTION=nytemode-canary' "$repo_root/docs/RELEASING_CANARY.md"

if grep -Fq 'github.com/block/buzz/releases/latest' \
  "$repo_root/desktop/src/features/settings/hooks/use-updater.ts"; then
  echo "Canary-aware updater hook must not hard-code Block releases" >&2
  exit 1
fi

echo "Canary distribution contract is isolated from official Buzz."
