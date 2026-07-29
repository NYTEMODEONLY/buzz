# Releasing nytemode edition

nytemode edition releases are built from immutable, fork-owned tags. The
release workflow never patches source manifests or regenerates dependency
lockfiles.

## Prepare the source

1. Complete the reviewed upstream-sync and custom-feature validation on
   `fork/main`. The local product branch must track that remote ref.
2. Update all four desktop version records in a normal reviewed commit:
   `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`,
   `desktop/src-tauri/Cargo.toml`, and the `buzz-desktop` entry in
   `desktop/src-tauri/Cargo.lock`.
3. Run the full source gate and confirm the tracked worktree is clean.
4. Create an immutable annotated tag at that exact commit:

   ```sh
   git tag -a nytemode-v0.5.0 -m "nytemode edition 0.5.0"
   git push fork refs/tags/nytemode-v0.5.0
   ```

The `nytemode-v` namespace is deliberately distinct from Block's `v` desktop
release tags.

## Run the release

Open **Release nytemode edition for macOS**, select the exact
`nytemode-vX.Y.Z` tag in the ref picker, and enter the matching `X.Y.Z`
version input.

The workflow fails closed unless:

- `GITHUB_REF` is the matching namespaced tag;
- the checked-out commit, tag commit, and `GITHUB_SHA` are identical;
- every desktop manifest and lockfile already contains the requested version;
- the updater endpoint is the fork-owned
  `NYTEMODEONLY/buzz` rolling release;
- all signing and updater credentials are present; and
- Cargo can build with the committed lockfiles under `--locked`.

The workflow creates a versioned release at the existing namespaced tag and
updates the `buzz-nytemode-latest` manifest only after publishing the signed
archive on the immutable versioned release. It does not create an
upstream-style `vX.Y.Z` tag or mutate dependencies during the build.

The workflow also:

- runs automatically for a pushed `nytemode-vX.Y.Z` tag;
- uses the protected `nytemode-production` environment;
- creates the versioned release as a draft;
- uploads the DMG, updater archive/signature, checksums, and provenance;
- publishes the immutable versioned release; and
- promotes `latest.json` last.

## Retry and verification

Retry only from the same immutable tag and matching version input. Do not move
or recreate a failed release tag.

Treat these as separate receipts:

1. source and tests at the tagged SHA;
2. signed and notarized artifacts built from that SHA;
3. installed app identity and preserved data lineage;
4. live UI and canonical agent behavior; and
5. a successful signed N to N+1 update plus rollback.

Run the focused local contract before changing the workflow:

```sh
scripts/test-nytemode-release-contract.sh
```

## Local smoke builds

A local Tauri bundle is not a public nytemode release. Before installing one
for smoke testing, replace the linker-only signatures with a complete ad-hoc
bundle signature and verify the sealed resources:

```sh
codesign --force --deep --sign - \
  --entitlements desktop/src-tauri/Entitlements.plist \
  desktop/src-tauri/target/release/bundle/macos/Buzz.app
codesign --verify --deep --strict --verbose=2 \
  desktop/src-tauri/target/release/bundle/macos/Buzz.app
```

Ad-hoc signing changes the app's code identity and can therefore trigger a
macOS Keychain approval prompt on first launch. That approval belongs to the
owner and must not be automated or bypassed. A locally ad-hoc-signed app is
appropriate only for on-machine validation; it is not notarized, is rejected
by Gatekeeper for public distribution, and must never be uploaded as a signed
release or updater artifact.

## Loopback-only updater pipeline

The local lane proves Tauri update mechanics without publishing an unsafe app.
It uses:

- `http://127.0.0.1:54127/latest.json`;
- a login LaunchAgent bound only to loopback;
- the committed updater key in `.release/nytemode-updater.pub`;
- the matching protected private key under
  `~/.buzz/nytemode-updater/keys/`; and
- immutable artifacts under `~/.buzz/nytemode-updater/feed/artifacts/`.

Initialize and inspect the feed:

```sh
just nytemode-local-update-init
just nytemode-local-update-status
```

Build and stage a version without publishing it:

```sh
just nytemode-local-update-build 0.5.1-nytemode.1
```

Publishing is a separate atomic step:

```sh
just nytemode-local-update-publish 0.5.1-nytemode.1
```

The build requires a clean exact source SHA, locked dependencies, the matching
private updater key, and an Apple Development signing identity unless
`NYTEMODE_ALLOW_ADHOC=1` is explicitly chosen. It produces a signed app,
updater archive/signature, SHA-256 sums, and provenance before allowing
`latest.json` to advance.

Installing a staged bootstrap is intentionally not a Just recipe. Run
`scripts/nytemode-local-updater.sh install VERSION` only after explicitly
quitting Buzz and recording the restart gate. The script refuses to quit a
running app, retains a timestamped previous app under `/Applications`, and
preserves the `xyz.block.buzz.app` data lineage.

This lane is local engineering evidence only. It does not satisfy Developer ID
signing, notarization, Gatekeeper, public distribution, or the production
N to N+1 gate.
