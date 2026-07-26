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

## Existing agents from official Buzz

Sign Canary into the same Buzz human identity and community. Canary discovers
the owner's relay-declared agents by pubkey and renders agents hosted by the
official client as `Managed elsewhere`.

Do not import or recreate those agents. Snapshot/team import intentionally
mints fresh keypairs and therefore creates different identities.

Expected side-by-side result:

1. Official Buzz remains the runtime host for its locally managed agents.
2. Canary shows those exact public IDs without local start/stop/edit controls.
3. Mentions and messages from either client target the same agent identities.
4. If the complete built-in Welcome Team already exists remotely, Canary skips
   local Welcome-team provisioning.

If an older Canary already minted duplicates, compare all local and canonical
pubkeys first. Delete/archive only the Canary-owned replacements, verify the
canonical identities remain unarchived, then relaunch Canary and confirm the
canonical cards read `Managed elsewhere`.
