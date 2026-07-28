# Upstream sync

NYTEMODE EDITION uses a reviewed integration flow. `main` is the product
branch. `block/buzz:main` is source input, never an automatic binary update.

## Branches

- `main`: releasable NYTEMODE EDITION.
- `automation/upstream-sync`: disposable proposal branch created from `main`
  with current upstream merged.
- `backup/*`: immutable rollback refs for major migrations.

## Routine

1. The upstream-sync workflow fetches `block/buzz:main`.
2. If new commits exist, it merges them on `automation/upstream-sync` and opens
   or refreshes a pull request into `main`.
3. Review the feature matrix in `NIGHT_MODE_EDITION.md`.
4. Compare each custom patch with upstream. Retire patches whose behavior is
   now native.
5. Re-audit provider allowance interfaces. Keep personal subscription
   allowance, API-team billing, and observed spend separate; remove an
   experimental reader if upstream or a provider ships a supported native
   equivalent.
6. Run focused feature tests, full CI, build an artifact, and exercise live UI
   and agent mentions.
7. Merge only after identity and data-lineage checks pass.
8. Tag and release from the reviewed `main` SHA.

Do not merge `main` directly into an upstream mirror and do not force-push the
product branch. Resolve upstream conflicts in the proposal pull request so the
exact decisions remain reviewable.

## Updater boundary

The installed NYTEMODE EDITION checks
`NYTEMODEONLY/buzz` for releases. A release build requires a nytemode-owned
Tauri updater public/private key pair and Apple signing/notarization
credentials. Block's OIDC signing role, updater key, and release endpoint are
not reusable by this fork.

The release manifest must name artifacts produced from the tagged `main` SHA.
Keep the previous signed installer until the new version has completed the
N to N+1 update test and agent-identity verification.

The `Release NYTEMODE EDITION for macOS` workflow enforces this boundary.
It intentionally fails before building unless all fork-owned updater and Apple
signing secrets are configured. Never weaken that preflight to produce an
untrusted public release.
