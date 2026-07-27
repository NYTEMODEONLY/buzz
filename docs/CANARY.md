# Buzz Canary architecture

Buzz Canary is an unofficial community distribution of
[Block's Buzz](https://github.com/block/buzz), maintained by
[nytemode](https://nytemode.com). It is not affiliated with or supported by
Block.

The fork keeps two permanent branches:

- `main` is a fast-forward-only mirror of `block/buzz:main`.
- `canary` is the public integration branch for reviewed community features.

Canary never merges back into `main`. Focused `fizz/*` branches remain based on
upstream `main` so they can be submitted to Block without carrying
distribution-only commits.

## Custom stack

Canary currently carries six product feature tracks:

1. Hermes ACP runtime and first-class external-agent presentation.
2. Detached external-agent activity visibility.
3. A local provider allowance indicator, including the global top-chrome meter.
4. Sidebar categories and exact manual channel ordering.
5. Grok Build as a native ACP harness, including onboarding selection and
   Grok 4.5 model discovery.
6. Cross-install agent identity continuity: another Buzz installation owned by
   the same human reuses the canonical relay identities instead of minting a
   second Welcome Team.

Footer attribution and official-Buzz isolation are distribution infrastructure,
not additional product features. The exact source commits and current upstream
PR mapping live in [CANARY_FEATURES.md](CANARY_FEATURES.md).

## Distribution boundary

Public releases must use all of these values together:

| Boundary | Buzz Canary | Official Buzz |
|---|---|---|
| Product | `Buzz Canary` | `Buzz` |
| Bundle identifier | `com.nytemode.buzz.canary` | `xyz.block.buzz.app` |
| OS keyring service | `buzz-desktop-canary` | `buzz-desktop` |
| Deep-link scheme | `buzz-canary://` | `buzz://` |
| Updater manifest | `NYTEMODEONLY/buzz` rolling release | `block/buzz` rolling release |
| Frontend distribution | `nytemode-canary` | unset |

The distinct identifier isolates app data. The distinct keyring service prevents
Canary from reading or overwriting official Buzz identities and managed-agent
secrets. Canary does not copy official credentials automatically; users sign in
or import deliberately. The deep-link scheme avoids nondeterministic routing
when both apps are installed.

The build fails closed unless its updater public key and exact fork-owned
manifest endpoint are supplied. A missing signing setup is a release blocker,
not a reason to reuse Block's trust root.

## Agent identity continuity

App-data and keyring isolation protect secrets; they must not create a second
logical agent team. Agent identity is the Nostr pubkey, not the card name.

When the signed-in owner already has a complete Welcome Team declared on the
relay, Canary:

- does not mint replacement Fizz/Honey/Bumble identities;
- shows the existing identities as `Managed elsewhere`;
- fetches each owner-declared agent profile by its exact pubkey so an older
  canonical profile cannot be lost behind a broad relay-directory result cap;
- treats the owner's kind `30177` managed-agent declaration as sufficient to
  preserve the canonical card when that agent has no usable kind `10100`
  directory profile;
- treats an exact owner-authored kind `30177` coordinate tombstone as a
  retirement marker for that agent's durable kind `10100` profile, unless a
  newer live declaration explicitly restores it;
- waits for the trusted archive snapshot before rendering relay-directory
  cards and fails closed if that snapshot cannot be verified;
- hides relay-archived identities even when their durable directory profiles
  remain available for history;
- hides local launch controls for personas already represented by those remote
  owner-managed identities;
- uses those same pubkeys for mentions, messages, DMs, profiles, activity, and
  owner-visible memory; and
- leaves start, stop, edit, and secret-bearing runtime controls on the client
  that actually holds each agent key.

This provides one agent identity/runtime across official Buzz and Canary while
preserving the side-by-side security boundary.

The owner-approval boundary is strict: Canary must not mint, import, clone,
provision, start, or draft a replacement merely because its local registry is
empty or its keyring is isolated. Creating a new agent or sibling identity
requires explicit owner approval. Updating, renaming, repairing, configuring,
or exposing an existing agent is not creation approval. Snapshot/team import
creates fresh keypairs and is not identity reuse.

Names, built-in persona IDs, timestamps, and online status are not identity
proof. If stale owner declarations survive an older install, resolve the exact
pubkeys and lifecycle records before cleanup; never select a deletion target
from the visible card label alone. A successful stale-declaration cleanup must
remove both the `Managed elsewhere` projection and the fallback `External`
projection without deleting the agent-authored profile, key, or runtime.

## Sidebar organization data

Sidebar categories reuse Buzz's encrypted `channel-sections` NIP-78 document.
Exact channel order is stored separately in the encrypted
`channel-manual-order` document, while group sort choices remain in
`channel-sort`. All three are scoped to the signed-in identity and normalized
community relay. Keeping order separate preserves compatibility with older
clients and prevents a malformed order payload from changing channel
membership.
