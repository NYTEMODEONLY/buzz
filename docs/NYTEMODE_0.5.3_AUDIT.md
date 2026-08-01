# NYTEMODE 0.5.3 integration audit

This audit records the integration of the customized NYTEMODE desktop client
with Buzz's upstream `desktop-v0.5.3` release. It separates source integration,
release automation, local installation, and the hosted updater because success
at one layer does not prove the others.

## Source baseline

- Previous NYTEMODE source: `d84d6d22fb0668eb3f0ce0c5b754088210ed5b30`
- Rollback ref: `backup/nytemode-before-v0.5.3-2026-07-31`
- Upstream 0.5.2: `v0.5.2` at
  `3e48f1b2365d326ee1c9582448d86a99b44ecd5d`
- Upstream 0.5.3: `desktop-v0.5.3` at
  `3a96acea09b4a9e3f02c3a26cfb0607d2ccacf42`
- NYTEMODE integration merge: `56d52df3d`

The merge retains NYTEMODE's provider allowance UI, manual sidebar ordering,
exact-pubkey external-agent and mention behavior, detached agent activity, and
the one-client identity/data contract. The Hermes preset also retains the
standard installer entry point, `hermes acp`.

## Updater root causes and repairs

The installed 0.5.1 build checked a loopback manifest whose remote version was
also `0.5.1-nytemode.8`. Tauri therefore correctly reported no update even
though newer upstream source releases existed. The fork had no hosted NYTEMODE
release manifest to bridge that gap.

Two automation defects also prevented the source side from staying current:

1. The upstream watcher only recognized `vX.Y.Z`, while Buzz 0.5.3 uses the
   `desktop-vX.Y.Z` stable tag namespace.
2. The default GitHub Actions token could not push an upstream merge that
   changed workflow files.

The watcher now accepts either stable tag namespace, supports an exact tag for
manual recovery, verifies the synchronized four-file version contract, and
uses the workflow-capable `NYTEMODE_SYNC_TOKEN` for proposal branches and pull
requests. The NYTEMODE release job now passes the signing-key password into the
actual Tauri build.

## Verification contract

Before a release is called complete, record each layer independently:

1. Source: merge the exact upstream tag and run the sync, release-ref, version,
   desktop TypeScript, Rust check, JavaScript, and Rust test contracts.
2. Artifact: build a signed NYTEMODE updater artifact and verify its signature,
   version, endpoint, bundle identifier, and executable hash.
3. Installation: install that exact artifact at `/Applications/Buzz.app` and
   re-check its signature, version, endpoint, identifier, and executable hash.
4. Live client: relaunch the installed app without replacing its identity or
   data and exercise the retained NYTEMODE UI and agent behaviors.
5. Updater: publish a strictly newer manifest, observe the installed client
   offer it, install through the updater, and verify the new installed version.

The hosted production release remains blocked until the fork repository has
the required Apple signing and notarization secrets. A signed loopback updater
release can prove the end-to-end updater path on the owner Mac without changing
the installed product identity or data.

## Source verification receipt

The integrated source passed:

- synchronized desktop version verification for `0.5.3`
- formatting, file-size, pixel-text, and pubkey-truncation checks
- TypeScript type checking
- 3,962 desktop JavaScript tests
- 2,088 desktop Rust library tests and 3 mixer diagnostics; 14 tests that
  require a real OS keychain were ignored by their explicit test contract
- 649 `buzz-acp` library tests
- 69 focused Playwright tests covering manual channel-category order, provider
  usage, exact-pubkey external agents, and mentions
- NYTEMODE upstream-sync, release, local-updater, and release-ref contracts

## Published and installed receipt

- Fork Main source: `6ea158b48a22e90d3b07ee5838b4daf0b0b5b113`
- Live exact-tag sync verification: GitHub Actions run `30684171554`
- Loopback feed version: `0.5.3-nytemode.1`
- Bundle identifier: `xyz.block.buzz.app`
- Installed path: `/Applications/Buzz.app`
- Installed executable SHA-256:
  `bc7815ac8409a0f028790054ac583e6c9d22e78c555af581d6cfed468b358f15`
- Installed signing identity: Apple Development team `Q2QT3TXJE4`

The pre-update installed client (`0.5.1-nytemode.8`) first displayed its old
no-update state. After publishing the strictly newer signed manifest, the same
running client downloaded it, displayed `Update downloaded. Click to apply.`,
applied it through Tauri's updater, and relaunched as `0.5.3-nytemode.1`. The
post-update Settings UI displayed `You're on the latest nytemode build.` Existing
channels, history, manual sidebar categories, and managed/external agent identities
remained present after relaunch.

## Hosted release credential boundary

The fork already has the Tauri updater keys and the workflow-capable upstream
sync token. A hosted, notarized production updater release additionally requires
these repository secrets:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_TEAM_ID`

Until those owner-controlled Apple credentials are supplied, the loopback feed
is the verified updater path for the owner Mac. The workflow must not claim a
hosted production release without those credentials and its release receipts.
