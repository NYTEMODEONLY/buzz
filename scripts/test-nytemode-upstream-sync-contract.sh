#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
workflow="$repo_root/.github/workflows/upstream-sync.yml"

grep -Fq 'repos/block/buzz/releases/latest' "$workflow"
grep -Fq 'refs/tags/$UPSTREAM_TAG:refs/tags/$UPSTREAM_TAG' "$workflow"
grep -Fq 'automation/upstream-$TAG' "$workflow"
grep -Fq 'git merge --no-edit "$UPSTREAM_SHA"' "$workflow"
grep -Fq 'git ls-remote --exit-code --heads origin "$BRANCH"' "$workflow"
grep -Fq 'git push origin "HEAD:refs/heads/$BRANCH"' "$workflow"

if grep -Eq 'fetch upstream main|merge .*upstream/main|push .*--force' "$workflow"; then
  echo "nytemode upstream watcher still consumes mutable main or force-pushes proposals" >&2
  exit 1
fi

echo "nytemode upstream sync contract passed"
