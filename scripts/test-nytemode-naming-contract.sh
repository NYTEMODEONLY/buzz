#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

forbidden_content_pattern='NIGHT''_MODE|night''Mode|night''-mode|Night'' Mode|NYTEMODE'' EDITION'
forbidden_path_pattern='night[._ -]?mode|nightmode'

if git grep -n -E "$forbidden_content_pattern" -- . \
  ':(exclude)scripts/test-nytemode-naming-contract.sh'; then
  echo "nytemode naming contract found a legacy spelling or identifier" >&2
  exit 1
fi

if git ls-files | grep -E -i "$forbidden_path_pattern"; then
  echo "nytemode naming contract found a legacy path" >&2
  exit 1
fi

echo "nytemode naming contract passed"
