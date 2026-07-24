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
