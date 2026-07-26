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

Canary currently carries five product feature tracks:

1. Hermes ACP runtime and first-class external-agent presentation.
2. Detached external-agent activity visibility.
3. A local provider allowance indicator, including the global top-chrome meter.
4. Sidebar categories and exact manual channel ordering.
5. Cross-install agent identity continuity: another Buzz installation owned by
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
- uses those same pubkeys for mentions, messages, DMs, profiles, activity, and
  owner-visible memory; and
- leaves start, stop, edit, and secret-bearing runtime controls on the client
  that actually holds each agent key.

This provides one agent identity/runtime across official Buzz and Canary while
preserving the side-by-side security boundary.

## Sidebar organization data

Sidebar categories reuse Buzz's encrypted `channel-sections` NIP-78 document.
Exact channel order is stored separately in the encrypted
`channel-manual-order` document, while group sort choices remain in
`channel-sort`. All three are scoped to the signed-in identity and normalized
community relay. Keeping order separate preserves compatibility with older
clients and prevents a malformed order payload from changing channel
membership.
