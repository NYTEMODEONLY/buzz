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

> [!WARNING]
> The two clients share one logical agent team. Do not import, recreate, clone,
> provision, start, or draft replacements for existing agents. Snapshot/team
> import intentionally mints fresh keypairs and therefore creates different
> identities. Creating a new agent or sibling identity requires the owner's
> explicit approval; an update, rename, repair, configuration, visibility, or
> client-sync request is not creation approval.

Expected side-by-side result:

1. Official Buzz remains the runtime host for its locally managed agents.
2. Canary shows those exact public IDs without local start/stop/edit controls.
3. Mentions and messages from either client target the same agent identities.
4. If the complete built-in Welcome Team already exists remotely, Canary skips
   local Welcome-team provisioning.
5. Archived replacement identities do not appear in the forward-looking agent
   directory, even if their durable Nostr profiles remain on the relay.
6. Local persona launch controls are absent for every owner-managed agent
   already hosted by the other installation.
7. An owner-managed agent with a kind `30177` declaration but no usable kind
   `10100` directory profile still appears under its canonical pubkey as
   `Managed elsewhere`.
8. Relay-directory cards remain withheld until the trusted archive snapshot
   resolves. If it fails, Canary exposes neither stale cards nor local launch
   controls.
9. An exact owner-authored kind `30177` coordinate tombstone suppresses the
   retired agent's durable kind `10100` profile, so cleanup cannot leave the
   same legacy identity behind as an `External` card. A later live declaration
   restores it.
10. An empty Canary managed-agent registry is valid when official Buzz hosts
    the canonical runtimes; no Welcome-team, persona-launch, import, or draft
    flow runs unless the owner explicitly approves creating a new identity.

If an older Canary already minted duplicates, compare all local and canonical
pubkeys and their owner-authored lifecycle records first. A shared name,
built-in persona, newer timestamp, or offline status is not sufficient proof.
Delete/archive only the exact stale replacements, verify the canonical
identities remain unarchived, then relaunch Canary and confirm the canonical
cards read `Managed elsewhere`. Do not delete agent-authored profiles, keys, or
runtimes merely to remove a stale directory projection.
