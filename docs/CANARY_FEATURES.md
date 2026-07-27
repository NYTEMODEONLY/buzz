# Canary feature inventory

This file tracks the custom stack carried by the `canary` branch. Proof belongs
to an exact release SHA; a source entry does not imply a downloadable release.

| Feature | State | Source | Upstream |
|---|---|---|---|
| Hermes ACP runtime and external-agent presentation | Integrated; cross-install managed agents excluded, Hermes runtime labeled | custom stack ending at `74e6d5a9` plus current Canary fixes | [block/buzz#2468](https://github.com/block/buzz/pull/2468) |
| Detached external-agent activity transport | Integrated with Hermes stack | `ee83b1b3` | carried as a dependent Canary patch |
| Provider allowance indicator | Integrated; Codex supported, Claude and Grok shown as unsupported states | `c40d6a7f`, `83a9e156` | [issue #2764](https://github.com/block/buzz/issues/2764), [PR #2765](https://github.com/block/buzz/pull/2765) |
| Sidebar categories and manual channel order | Integrated; pointer and keyboard ordering, hover/focus/touch-safe drag handles, safe category lifecycle, startup-race-safe encrypted relay sync, WKWebView-safe manual-row painting | `3a054a9b`, `32abd775`, `b51ef529`, `c4319dc4` | [block/buzz#2947](https://github.com/block/buzz/pull/2947) |
| Grok Build ACP harness | Integrated; native Grok CLI discovery, onboarding selection, Grok 4.5 model discovery, xAI login guidance, and managed headless defaults | current Canary | [block/buzz#2546](https://github.com/block/buzz/pull/2546) |
| Cross-install agent identity continuity | Integrated; owner-managed relay identities render as `Managed elsewhere`, a complete remote Welcome Team suppresses replacement keypair minting, relay cards fail closed until archive state is verified, exact owner tombstones suppress retired profiles without deleting keys or runtimes, and docs require explicit owner approval before any new or sibling identity is created | current Canary | Canary product fix; upstream proposal pending |
| Footer attribution | Canary-only | distribution commit | links `canary by nytemode` to `https://nytemode.com` through Tauri's safe opener |

Provider allowance reads local provider-reported usage windows. It is not API
billing data and does not promise account-wide completeness.

## Upstream contribution status

Audited against `block/buzz` on 2026-07-26:

| PR | Feature | Exact head | Current gate |
|---|---|---|---|
| [#2468](https://github.com/block/buzz/pull/2468) | Hermes ACP and external-agent integration | `74e6d5a9` | Open; review required; currently conflicts with upstream `main` |
| [#2765](https://github.com/block/buzz/pull/2765) | Local provider allowance indicator | `9e2dad3a` | Open; mergeable; review required |
| [#2947](https://github.com/block/buzz/pull/2947) | Sidebar categories and manual channel ordering | `2097ac40` | Open; mergeable; review required |
| [#2546](https://github.com/block/buzz/pull/2546) | Grok Build native ACP runtime and onboarding harness | `dbaf267f` | Open; mergeable; approved by one contributor; maintainer review required |

The detached-activity patch and cross-install identity continuity do not
currently have standalone upstream PRs. Distribution isolation and footer
attribution are Canary-only infrastructure. This makes the current count
**six product feature tracks and four open upstream PRs**.

The identity feature is deliberately one-way at the creation boundary:
isolated app data does not authorize a second team. Empty local state must
resolve to existing owner-declared pubkeys or fail closed, never to implicit
agent creation, snapshot import, persona launch, or a replacement draft.

When an upstream PR merges, the next upstream sync removes the duplicate local
patch while preserving the user-visible feature and its regression coverage.
