# Releasing NYTEMODE EDITION

NYTEMODE EDITION releases are built from immutable, fork-owned tags. The
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
   git tag -a night-mode-v0.5.0 -m "NYTEMODE EDITION 0.5.0"
   git push fork refs/tags/night-mode-v0.5.0
   ```

The `night-mode-v` namespace is deliberately distinct from Block's `v` desktop
release tags.

## Run the release

Open **Release NYTEMODE EDITION for macOS**, select the exact
`night-mode-vX.Y.Z` tag in the ref picker, and enter the matching `X.Y.Z`
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
updates the signed `buzz-night-mode-latest` updater artifacts. It does not
create an upstream-style `vX.Y.Z` tag or mutate dependencies during the build.

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
scripts/test-night-mode-release-contract.sh
```

## Local smoke builds

A local Tauri bundle is not a public Night Mode release. Before installing one
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
