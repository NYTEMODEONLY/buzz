# Canary feature inventory

This file tracks the custom stack carried by the `canary` branch. Proof belongs
to an exact release SHA; a source entry does not imply a downloadable release.

| Feature | State | Source | Upstream |
|---|---|---|---|
| Hermes ACP runtime and external-agent presentation | Integrated; cross-install managed agents excluded, Hermes runtime labeled | custom stack ending at `74e6d5a9` plus current Canary fixes | [block/buzz#2468](https://github.com/block/buzz/pull/2468) |
| Detached external-agent activity transport | Integrated with Hermes stack | `ee83b1b3` | carried as a dependent Canary patch |
| Provider allowance indicator | Integrated; Codex supported, Claude and Grok shown as unsupported states | `c40d6a7f`, `83a9e156` | [issue #2764](https://github.com/block/buzz/issues/2764), [PR #2765](https://github.com/block/buzz/pull/2765) |
| Sidebar categories and manual channel order | Integrated; pointer and keyboard ordering, safe category lifecycle, startup-race-safe encrypted relay sync | `3a054a9b`, `32abd775` | focused upstream branch `fizz/sidebar-categories-manual-order` |
| Footer attribution | Canary-only | distribution commit | links `canary by nytemode` to `https://nytemode.com` through Tauri's safe opener |

Provider allowance reads local provider-reported usage windows. It is not API
billing data and does not promise account-wide completeness.

When an upstream PR merges, the next upstream sync removes the duplicate local
patch while preserving the user-visible feature and its regression coverage.
