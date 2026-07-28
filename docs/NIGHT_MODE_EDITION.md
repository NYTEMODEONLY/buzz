# Buzz NYTEMODE EDITION

NYTEMODE EDITION is the single Buzz desktop client maintained for nytemode.
It follows current `block/buzz:main` while keeping a small, reviewable patch
stack for custom product behavior.

## Product contract

- One installed app: `/Applications/Buzz.app`.
- One bundle identifier and data lineage: `xyz.block.buzz.app`.
- One deep link: `buzz:`.
- One existing owner identity and one canonical pubkey per agent.
- Settings always identifies the build as **NYTEMODE EDITION** and links to
  [nytemode.dev](https://nytemode.dev).
- Updates come only from signed `NYTEMODEONLY/buzz` releases.

The former side-by-side Canary bundle, keyring, deep link, release channel, and
distribution flag are retired. Canary databases are migration evidence only;
they must never be replayed into the main database or used to provision agents.

## Maintained custom features

| Area | Night Mode patch | Upstream relationship |
| --- | --- | --- |
| Provider allowance | Displays every provider used by active agents in parallel | Codex has a supported personal allowance reader; providers without one remain visible with an explicit unavailable state |
| Sidebar organization | Categories, manual ordering, and quiet drag handles | Kept as an isolated feature module and covered by focused tests |
| External agents | Relay-hosted agents can be named and mentioned by exact pubkey | Uses upstream managed-agent and relay-directory primitives |
| Detached activity | Advertises observer support for detached work | Small capability patch over the upstream ACP runtime |
| Branding and updates | Night Mode footer, website, releases, and updater trust | Isolated in `shared/nightModeEdition.ts` and release configuration |

Grok is detected from Zero's active runtime and shown next to Codex. The
consumer Grok client does not currently expose a supported remaining-allowance
reader, so NYTEMODE EDITION reports `allowance unavailable` instead of
inventing a percentage. Provider cards are independent: one provider failing
does not hide another provider's balance.

## Native-first maintenance

Before retaining a custom patch during an upstream sync:

1. Look for an equivalent upstream implementation.
2. Prefer the native implementation when it preserves the user-visible
   contract and existing identities.
3. Delete the redundant custom patch and its migration shims.
4. Keep or add a regression test for the behavior that matters.
5. Record the decision in the upstream-sync pull request.

This is why the old custom Grok/Hermes runtime implementation is not carried
forward: current upstream Buzz provides generic BYOH harness presets and the
observer protocol foundation. NYTEMODE EDITION keeps only the integration
needed for the actual external agents and UI.

## Verification layers

Treat these as separate gates:

1. Source: focused tests, typecheck, Rust checks, and CI pass.
2. Artifact: a reproducible app bundle is built from the recorded SHA.
3. Installation: the bundle replaces `/Applications/Buzz.app` without changing
   its data lineage.
4. Live UI: footer, provider cards, categories, and updater channel are visible.
5. Live agents: every canonical local agent plus Alice and Zero can be selected
   and mentioned by exact pubkey, and replies are read back.
6. Update: a signed N to N+1 install is exercised before automatic updates are
   described as production-ready.
