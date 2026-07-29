#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
state_root=${NYTEMODE_LOCAL_UPDATER_STATE_DIR:-"$HOME/.buzz/nytemode-updater"}
feed_root="$state_root/feed"
key_dir="$state_root/keys"
private_key="$key_dir/nytemode.key"
local_public_key="$key_dir/nytemode.key.pub"
committed_public_key="$repo_root/.release/nytemode-updater.pub"
port=${NYTEMODE_LOCAL_UPDATER_PORT:-54127}
endpoint="http://127.0.0.1:${port}/latest.json"
launch_agent_label="com.nytemode.buzz.local-updater-feed"
launch_agent="$HOME/Library/LaunchAgents/${launch_agent_label}.plist"

usage() {
  cat <<'EOF'
Usage: scripts/nytemode-local-updater.sh <command> [version]

Commands:
  init                 Validate updater keys and install the loopback feed service
  serve                Serve the local feed in the foreground
  build VERSION        Build and stage a signed updater-enabled app and archive
  publish VERSION      Atomically promote a staged version to latest.json
  install VERSION      Install a staged app after Buzz has been quit explicitly
  status               Show service, feed, key, and staged-version status

VERSION must be a complete SemVer, for example 0.5.1-nytemode.1.
EOF
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command '$1' is unavailable"
}

validate_port() {
  [[ "$port" =~ ^[0-9]+$ ]] || fail "NYTEMODE_LOCAL_UPDATER_PORT must be numeric"
  (( port >= 1024 && port <= 65535 )) || fail "local updater port must be 1024-65535"
}

validate_version() {
  local version=$1
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] ||
    fail "version '$version' is not complete SemVer"

  local source_version
  source_version=$(node -p "require('$repo_root/desktop/package.json').version")
  [[ "$version" == "$source_version" || "$version" == "$source_version"-* ]] ||
    fail "version '$version' must equal or extend source version '$source_version'"
}

canonical_public_key() {
  tr -d '\r\n' < "$1"
}

public_key_sha256() {
  canonical_public_key "$1" | shasum -a 256 | awk '{print $1}'
}

validate_keys() {
  [[ -f "$committed_public_key" ]] || fail "committed updater public key is missing"
  [[ -f "$private_key" ]] ||
    fail "private updater key is missing at $private_key; restore the matching protected backup"
  [[ -f "$local_public_key" ]] ||
    fail "local updater public key is missing at $local_public_key"
  [[ "$(canonical_public_key "$committed_public_key")" == \
    "$(canonical_public_key "$local_public_key")" ]] ||
    fail "local updater keypair does not match the committed public key"
  chmod 700 "$key_dir"
  chmod 600 "$private_key"
  chmod 644 "$local_public_key"
}

install_launch_agent() {
  install -d -m 755 "$HOME/Library/LaunchAgents"
  install -d -m 700 "$state_root"
  install -d -m 755 "$feed_root"

  if launchctl print "gui/$(id -u)/$launch_agent_label" >/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)/$launch_agent_label"
  fi

  plutil -create xml1 "$launch_agent"
  /usr/libexec/PlistBuddy -c "Add :Label string $launch_agent_label" "$launch_agent"
  /usr/libexec/PlistBuddy -c "Add :ProgramArguments array" "$launch_agent"
  /usr/libexec/PlistBuddy -c "Add :ProgramArguments:0 string /bin/bash" "$launch_agent"
  /usr/libexec/PlistBuddy -c "Add :ProgramArguments:1 string $repo_root/scripts/nytemode-local-updater.sh" "$launch_agent"
  /usr/libexec/PlistBuddy -c "Add :ProgramArguments:2 string serve" "$launch_agent"
  /usr/libexec/PlistBuddy -c "Add :RunAtLoad bool true" "$launch_agent"
  /usr/libexec/PlistBuddy -c "Add :KeepAlive bool true" "$launch_agent"
  /usr/libexec/PlistBuddy -c "Add :StandardOutPath string $state_root/feed.stdout.log" "$launch_agent"
  /usr/libexec/PlistBuddy -c "Add :StandardErrorPath string $state_root/feed.stderr.log" "$launch_agent"
  chmod 644 "$launch_agent"
  launchctl bootstrap "gui/$(id -u)" "$launch_agent"
  launchctl kickstart -k "gui/$(id -u)/$launch_agent_label"
}

resolve_codesign_identity() {
  if [[ -n "${NYTEMODE_CODESIGN_IDENTITY:-}" ]]; then
    printf '%s\n' "$NYTEMODE_CODESIGN_IDENTITY"
    return
  fi

  local identity
  identity=$(
    security find-identity -v -p codesigning |
      awk '/"Apple Development:/ { print $2; exit }'
  )
  if [[ -n "$identity" ]]; then
    printf '%s\n' "$identity"
    return
  fi

  if [[ "${NYTEMODE_ALLOW_ADHOC:-0}" == "1" ]]; then
    printf '%s\n' "-"
    return
  fi

  fail "no Apple Development signing identity found; set NYTEMODE_CODESIGN_IDENTITY or explicitly opt into NYTEMODE_ALLOW_ADHOC=1"
}

prepare_mesh_llama() {
  local mesh_rev mesh_short mesh_root
  mesh_rev=$(
    python3 -c 'import tomllib; d=tomllib.load(open("Cargo.lock", "rb")); p=next(p for p in d["package"] if p["name"] == "mesh-llm-sdk"); print(p["source"].rsplit("#", 1)[1])'
  )
  mesh_short=${mesh_rev:0:7}
  export LLAMA_STAGE_BACKEND=metal
  export LLAMA_STAGE_BUILD_DIR="$repo_root/.cache/mesh-llama/build-stage-abi-metal"
  export CMAKE_OSX_DEPLOYMENT_TARGET=10.15
  export MACOSX_DEPLOYMENT_TARGET=10.15
  export CMAKE_POLICY_VERSION_MINIMUM=3.5
  export SKIPPY_LLAMA_AUTO_BUILD=0

  if find "$LLAMA_STAGE_BUILD_DIR" -type f -name 'libllama*' -print -quit 2>/dev/null |
    grep -q .; then
    return
  fi

  cargo fetch --locked --manifest-path desktop/src-tauri/Cargo.toml
  mesh_root=$(
    find "${CARGO_HOME:-$HOME/.cargo}/git/checkouts" \
      -path "*/$mesh_short" -type d -name "$mesh_short" |
      head -1
  )
  [[ -n "$mesh_root" ]] || fail "mesh-llm checkout for $mesh_short was not found"
  "$mesh_root/scripts/prepare-llama.sh" pinned
  "$mesh_root/scripts/build-llama.sh" -DCMAKE_OSX_DEPLOYMENT_TARGET=10.15
}

build_version() {
  local version=$1
  validate_version "$version"
  validate_keys
  require_command jq
  require_command codesign
  require_command shasum

  [[ -z "$(git -C "$repo_root" status --porcelain)" ]] ||
    fail "source worktree must be clean before a local updater build"

  # shellcheck source=/dev/null
  . "$repo_root/bin/activate-hermit"
  cd "$repo_root"

  local artifact_dir
  artifact_dir="$feed_root/artifacts/$version"
  [[ ! -e "$artifact_dir" ]] ||
    fail "staged version '$version' already exists and is immutable"
  install -d -m 755 "$artifact_dir"
  export BUZZ_UPDATER_ENDPOINT="$endpoint"
  export BUZZ_UPDATER_PUBLIC_KEY
  BUZZ_UPDATER_PUBLIC_KEY=$(canonical_public_key "$committed_public_key")
  export NYTEMODE_LOCAL_VERSION="$version"

  (cd desktop && node scripts/build-nytemode-local-release-config.mjs)

  cargo build --locked --release \
    -p buzz-acp \
    -p buzz-agent \
    -p buzz-dev-mcp \
    -p git-credential-nostr \
    -p buzz-cli
  "$repo_root/scripts/bundle-sidecars.sh"
  prepare_mesh_llama

  (
    cd desktop
    pnpm tauri build \
      --verbose \
      --no-sign \
      --bundles app \
      --features mesh-llm \
      --config src-tauri/tauri.local-release.conf.json \
      -- \
      --locked
  )

  local bundle_dir app identity archive signature
  bundle_dir="$repo_root/desktop/src-tauri/target/release/bundle"
  app="$bundle_dir/macos/Buzz.app"
  archive="$artifact_dir/Buzz.app.tar.gz"
  signature="$archive.sig"
  identity=$(resolve_codesign_identity)

  [[ -d "$app" ]] || fail "Tauri app bundle was not produced"
  codesign --force --deep --options runtime --sign "$identity" \
    --entitlements "$repo_root/desktop/src-tauri/Entitlements.plist" "$app"
  codesign --verify --deep --strict --verbose=2 "$app"

  /usr/bin/ditto "$app" "$artifact_dir/Buzz.app"
  (
    cd "$bundle_dir/macos"
    /usr/bin/tar -czf "$archive" Buzz.app
  )
  (
    cd "$repo_root/desktop"
    pnpm tauri signer sign \
      --private-key-path "$private_key" \
      --password "" \
      "$archive"
  )
  [[ -f "$signature" ]] || fail "updater signature was not produced"

  shasum -a 256 "$archive" "$signature" > "$artifact_dir/SHA256SUMS"
  jq -n \
    --arg version "$version" \
    --arg source_sha "$(git -C "$repo_root" rev-parse HEAD)" \
    --arg upstream_tag "$(git -C "$repo_root" tag --merged HEAD --list 'v*' --sort=-version:refname | head -1)" \
    --arg bundle_id "xyz.block.buzz.app" \
    --arg endpoint "$endpoint" \
    --arg public_key_sha256 "$(public_key_sha256 "$committed_public_key")" \
    --arg codesign_identity "$identity" \
    '{
      version: $version,
      source_sha: $source_sha,
      upstream_tag: $upstream_tag,
      bundle_id: $bundle_id,
      endpoint: $endpoint,
      updater_public_key_sha256: $public_key_sha256,
      codesign_identity: $codesign_identity
    }' > "$artifact_dir/provenance.json"

  printf 'Staged nytemode local update %s at %s\n' "$version" "$artifact_dir"
}

publish_version() {
  local version=$1
  validate_version "$version"
  validate_keys
  local artifact_dir archive signature manifest_tmp
  artifact_dir="$feed_root/artifacts/$version"
  archive="$artifact_dir/Buzz.app.tar.gz"
  signature="$archive.sig"
  manifest_tmp="$feed_root/latest.json.next"

  [[ -f "$archive" && -f "$signature" && -d "$artifact_dir/Buzz.app" ]] ||
    fail "version '$version' has not been staged"
  codesign --verify --deep --strict --verbose=2 "$artifact_dir/Buzz.app"

  jq -n \
    --arg version "$version" \
    --arg notes "Buzz nytemode local update $version" \
    --arg pub_date "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --arg signature "$(tr -d '\n' < "$signature")" \
    --arg url "http://127.0.0.1:${port}/artifacts/${version}/Buzz.app.tar.gz" \
    '{
      version: $version,
      notes: $notes,
      pub_date: $pub_date,
      platforms: {
        "darwin-aarch64": {
          signature: $signature,
          url: $url
        }
      }
    }' > "$manifest_tmp"
  mv "$manifest_tmp" "$feed_root/latest.json"
  printf 'Published nytemode local update %s to %s\n' "$version" "$endpoint"
}

install_version() {
  local version=$1
  validate_version "$version"
  local staged_app backup timestamp
  staged_app="$feed_root/artifacts/$version/Buzz.app"
  [[ -d "$staged_app" ]] || fail "staged app for '$version' is missing"
  if pgrep -f '^/Applications/Buzz\.app/Contents/MacOS/buzz-desktop$' >/dev/null; then
    fail "Buzz is running; quit it explicitly before installation"
  fi

  timestamp=$(date -u +'%Y%m%dT%H%M%SZ')
  backup="/Applications/.Buzz.nytemode-local-${timestamp}.previous.app"
  if [[ -d /Applications/Buzz.app ]]; then
    /usr/bin/ditto /Applications/Buzz.app "$backup"
  fi
  /usr/bin/ditto "$staged_app" /Applications/Buzz.app
  codesign --verify --deep --strict --verbose=2 /Applications/Buzz.app
  printf 'Installed %s; previous app backup: %s\n' "$version" "$backup"
}

show_status() {
  validate_port
  printf 'endpoint=%s\n' "$endpoint"
  printf 'state_root=%s\n' "$state_root"
  if [[ -f "$committed_public_key" ]]; then
    printf 'public_key_sha256=%s\n' \
      "$(public_key_sha256 "$committed_public_key")"
  fi
  if launchctl print "gui/$(id -u)/$launch_agent_label" >/dev/null 2>&1; then
    printf 'service=loaded\n'
  else
    printf 'service=not-loaded\n'
  fi
  if curl --fail --silent --show-error "$endpoint" >/dev/null 2>&1; then
    printf 'feed=available\n'
    curl --fail --silent "$endpoint" | jq '{version, pub_date, platforms}'
  else
    printf 'feed=empty-or-unavailable\n'
  fi
  if [[ -d "$feed_root/artifacts" ]]; then
    find "$feed_root/artifacts" -mindepth 1 -maxdepth 1 -type d -print |
      sed 's#^.*/#staged=#' |
      sort
  fi
}

validate_port
command=${1:-}
case "$command" in
  init)
    validate_keys
    install_launch_agent
    printf 'Local updater feed service installed at %s\n' "$endpoint"
    ;;
  serve)
    install -d -m 755 "$feed_root"
    exec /usr/bin/python3 -m http.server "$port" \
      --bind 127.0.0.1 \
      --directory "$feed_root"
    ;;
  build)
    [[ $# -eq 2 ]] || fail "build requires VERSION"
    build_version "$2"
    ;;
  publish)
    [[ $# -eq 2 ]] || fail "publish requires VERSION"
    publish_version "$2"
    ;;
  install)
    [[ $# -eq 2 ]] || fail "install requires VERSION"
    install_version "$2"
    ;;
  status)
    show_status
    ;;
  *)
    usage
    [[ -n "$command" ]] && exit 1
    ;;
esac
