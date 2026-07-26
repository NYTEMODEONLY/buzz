# Releasing Buzz Canary

Versions use `<upstream-version>-canary.N`; immutable tags use
`canary-v<version>`. A tag must point to a clean, reviewed `canary` SHA.

## Required secrets

- A nytemode-owned Apple signing identity and notarization credentials for
  macOS.
- A nytemode-owned Tauri updater keypair:
  `BUZZ_CANARY_UPDATER_PUBLIC_KEY`, `TAURI_SIGNING_PRIVATE_KEY`, and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Equivalent platform signing credentials before a platform is described as
  signed.

Never reuse Block's OIDC signing route, updater key, or updater endpoint.

## Build contract

Generate the release override from `desktop/`:

```bash
BUZZ_CANARY_UPDATER_PUBLIC_KEY=... \
BUZZ_CANARY_UPDATER_ENDPOINT=https://github.com/NYTEMODEONLY/buzz/releases/download/buzz-canary-latest/latest.json \
node scripts/build-canary-release-config.mjs
```

Every release build must also compile with:

```bash
VITE_BUZZ_DISTRIBUTION=nytemode-canary
BUZZ_DESKTOP_BUILD_KEYRING_SERVICE=buzz-desktop-canary
BUZZ_DESKTOP_BUILD_DEEP_LINK_SCHEME=buzz-canary
```

Build updater artifacts with the generated
`src-tauri/tauri.canary-release.conf.json`, sign the application for its
platform, then sign the updater archive with the fork-owned Tauri key.

Publish versioned assets, SHA-256 checksums, signatures, source SHA, and release
notes to an immutable versioned release. Publish `latest.json` only to the
rolling `buzz-canary-latest` release.

## Proof gate

Before describing auto-update as working:

1. Install signed Canary N beside official Buzz.
2. Publish signed Canary N+1 and its fork-owned manifest.
3. Use Settings to detect, download, install, and relaunch N+1.
4. Verify the installed executable corresponds to the released source SHA.
5. Verify footer attribution, provider allowance, Hermes/external-agent cards,
   detached activity, sidebar category creation/rename/delete, manual channel
   ordering, hover/focus/touch drag-handle behavior, channels, DMs, and restart
   persistence.
6. Verify official Buzz app data and keyring entries remain untouched.
7. Verify the manifest signature and asset URLs, then exercise rollback using
   the retained N installer.

Until that gate is complete, documentation must say source-only or unsigned
manual artifact, whichever is true.
