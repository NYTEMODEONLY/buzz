# Upstream sync

NYTEMODE EDITION uses a reviewed integration flow. `fork/main` is the product
branch. `block/buzz` is source input, never an automatic binary update.

## Branches

- `fork/main`: releasable NYTEMODE EDITION. The local product branch must track
  this ref, never `origin/main`.
- `origin/main`: current Block development input. It can be newer than the
  latest release and is not automatically a release target.
- `automation/upstream-sync`: disposable proposal branch created from
  `fork/main` with one reviewed upstream tag or commit merged.
- `backup/*`: immutable rollback refs for major migrations.

## Routine

1. Fetch upstream tags and identify the exact Block release commit.
2. Create `automation/upstream-sync` from `fork/main`, merge the exact release
   tag, and open or refresh a pull request into `fork/main`. Post-release
   `origin/main` commits require a separate review.
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
8. Tag and release from the reviewed `fork/main` SHA using the fork-specific
   Night Mode tag namespace.

Do not make the product branch track `origin/main`, do not force-push it, and
do not reuse an upstream `vX.Y.Z` tag for a different Night Mode commit.
Resolve upstream conflicts in the proposal pull request so the exact decisions
remain reviewable.

## Updater boundary

The installed NYTEMODE EDITION checks
`NYTEMODEONLY/buzz` for releases. A release build requires a nytemode-owned
Tauri updater public/private key pair and Apple signing/notarization
credentials. Block's OIDC signing role, updater key, and release endpoint are
not reusable by this fork.

The release manifest must name artifacts produced from the tagged `fork/main`
SHA.
Keep the previous signed installer until the new version has completed the
N to N+1 update test and agent-identity verification.

The release tag must resolve to the workflow's exact `GITHUB_SHA`. Release
builds use the checked-in lockfiles and must not run dependency updates.

The `Release NYTEMODE EDITION for macOS` workflow enforces this boundary.
It intentionally fails before building unless all fork-owned updater and Apple
signing secrets are configured. Never weaken that preflight to produce an
untrusted public release.
