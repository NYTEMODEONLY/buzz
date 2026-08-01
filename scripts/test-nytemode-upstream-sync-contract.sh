#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
workflow="$repo_root/.github/workflows/upstream-sync.yml"

grep -Fq 'repos/block/buzz/releases/latest' "$workflow"
grep -Fq 'vX.Y.Z or desktop-vX.Y.Z' "$workflow"
grep -Fq '[[ "$TAG" =~ ^(desktop-)?v(' "$workflow"
grep -Fq 'refs/tags/$UPSTREAM_TAG:refs/tags/$UPSTREAM_TAG' "$workflow"
grep -Fq 'automation/upstream-v$VERSION' "$workflow"
grep -Fq 'token: ${{ secrets.NYTEMODE_SYNC_TOKEN }}' "$workflow"
grep -Fq 'GH_TOKEN: ${{ secrets.NYTEMODE_SYNC_TOKEN }}' "$workflow"
grep -Fq 'git merge --no-edit "$UPSTREAM_SHA"' "$workflow"
grep -Fq 'verify-release-version.mjs "$UPSTREAM_VERSION"' "$workflow"
grep -Fq 'git ls-remote --exit-code --heads origin "$BRANCH"' "$workflow"
grep -Fq 'git push origin "HEAD:refs/heads/$BRANCH"' "$workflow"
grep -Fq 'gh pr list --base main --head "$BRANCH"' "$workflow"

if grep -Eq 'fetch upstream main|merge .*upstream/main|push .*--force' "$workflow"; then
  echo "nytemode upstream watcher still consumes mutable main or force-pushes proposals" >&2
  exit 1
fi

echo "nytemode upstream sync contract passed"
