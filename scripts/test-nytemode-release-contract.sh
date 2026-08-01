#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
workflow="$repo_root/.github/workflows/nytemode-release.yml"
verify_ref="$repo_root/scripts/verify-release-ref.sh"
verify_version="$repo_root/desktop/scripts/verify-release-version.mjs"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

git -C "$tmp" init -q
git -C "$tmp" config user.name test
git -C "$tmp" config user.email test@example.com
echo release >"$tmp/file"
git -C "$tmp" add file
git -C "$tmp" commit -qm release
release_sha=$(git -C "$tmp" rev-parse HEAD)
git -C "$tmp" tag -m "nytemode release" nytemode-v1.2.3

(
  cd "$tmp"
  GITHUB_REF=refs/tags/nytemode-v1.2.3 \
    GITHUB_SHA="$release_sha" \
    "$verify_ref" nytemode-v 1.2.3
)

if (
  cd "$tmp"
  GITHUB_REF=refs/tags/nytemode-v1.2.3 \
    GITHUB_SHA=0000000000000000000000000000000000000000 \
    "$verify_ref" nytemode-v 1.2.3
); then
  echo "nytemode release accepted a workflow SHA different from its tag" >&2
  exit 1
fi

if (
  cd "$tmp"
  GITHUB_REF=refs/tags/v1.2.3 \
    GITHUB_SHA="$release_sha" \
    "$verify_ref" nytemode-v 1.2.3
); then
  echo "nytemode release accepted the upstream desktop tag namespace" >&2
  exit 1
fi

current_version=$(node -p "require('$repo_root/desktop/package.json').version")
node "$verify_version" "$current_version"
if node "$verify_version" 999.999.999; then
  echo "release version validator accepted mismatched manifests" >&2
  exit 1
fi

mkdir -p "$tmp/release-config/src-tauri"
mkdir -p "$tmp/.release"
cp "$repo_root/.release/nytemode-updater.pub" "$tmp/.release/nytemode-updater.pub"
updater_public_key=$(tr -d '\n' < "$repo_root/.release/nytemode-updater.pub")
(
  cd "$tmp/release-config"
  BUZZ_RELEASE_DISTRIBUTION=nytemode \
    BUZZ_UPDATER_PUBLIC_KEY="$updater_public_key" \
    BUZZ_UPDATER_ENDPOINT=https://github.com/NYTEMODEONLY/buzz/releases/download/buzz-nytemode-latest/latest.json \
    node "$repo_root/desktop/scripts/build-release-config.mjs"
)

if (
  cd "$tmp/release-config"
  BUZZ_RELEASE_DISTRIBUTION=nytemode \
    BUZZ_UPDATER_PUBLIC_KEY="$updater_public_key" \
    BUZZ_UPDATER_ENDPOINT=https://github.com/block/buzz/releases/download/buzz-desktop-latest/latest.json \
    node "$repo_root/desktop/scripts/build-release-config.mjs"
); then
  echo "nytemode release config accepted Block's updater endpoint" >&2
  exit 1
fi

grep -Fq "'nytemode-v[0-9]*'" "$workflow"
grep -Fq 'environment: nytemode-production' "$workflow"
grep -Fq 'verify-release-ref.sh nytemode-v "$VERSION"' "$workflow"
grep -Fq 'verify-release-version.mjs "$VERSION"' "$workflow"
grep -Fq 'BUZZ_RELEASE_DISTRIBUTION: nytemode' "$workflow"
grep -Fq 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}' "$workflow"
grep -Fq 'cargo build --locked --release' "$workflow"
grep -Fq 'cargo fetch --locked --manifest-path' "$workflow"
grep -Fq -- '--locked' "$workflow"
grep -Fq 'TAG="$RELEASE_TAG"' "$workflow"
grep -Fq -- '--verify-tag' "$workflow"
grep -Fq 'persist-credentials: false' "$workflow"
grep -Fq -- '--draft' "$workflow"
grep -Fq 'SHA256SUMS' "$workflow"
grep -Fq 'provenance.json' "$workflow"
grep -Fq 'gh release edit "$TAG" --draft=false' "$workflow"
grep -Fq 'releases/download/$TAG/$ARCHIVE_NAME' "$workflow"

if grep -Eq 'cargo update|set-version-from-tag\.mjs|refs/heads/main|TAG="v\$VERSION"' "$workflow"; then
  echo "nytemode release workflow still mutates dependencies or accepts a branch/upstream tag" >&2
  exit 1
fi

if grep -F 'gh release upload "$TAG"' "$workflow" | grep -Fq -- '--clobber'; then
  echo "nytemode versioned release permits mutable asset replacement" >&2
  exit 1
fi

if grep -F 'gh release create "$TAG"' "$workflow" | grep -Fq '|| true'; then
  echo "nytemode versioned release permits mutable or swallowed publication" >&2
  exit 1
fi

if grep -Eq 'uses: [^ ]+@v[0-9]' "$workflow"; then
  echo "nytemode release workflow contains an action pinned only to a mutable major tag" >&2
  exit 1
fi

echo "nytemode release contract passed"
