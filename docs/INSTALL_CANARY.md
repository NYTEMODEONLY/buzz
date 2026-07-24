# Install Buzz Canary

No public install is advertised until a signed release and its checksums exist.
Source code on `canary` is reviewable and buildable, but source publication is
not a signed binary release.

When releases begin:

1. Open the fork's
   [Releases](https://github.com/NYTEMODEONLY/buzz/releases) page.
2. Select the asset for your operating system and architecture.
3. Verify its SHA-256 checksum against the release's checksum file.
4. Install `Buzz Canary` beside official Buzz. The two apps use separate app
   data, keyring services, updater keys, and deep-link schemes.
5. Sign in or import credentials deliberately. Canary never copies official
   Buzz secrets automatically.

Keep the previous signed installer for rollback. Rolling back the executable
does not roll back application data; back up important local state before
testing a prerelease.

Uninstalling Canary must target `Buzz Canary` and its
`com.nytemode.buzz.canary` data only. Do not remove official Buzz data or the
`buzz-desktop` keyring service.
