# Night Mode integration audit: Buzz 0.5.0

## Audited state

- Previous official release: `v0.4.26`
  (`0096d710ed2e6abab19aaf7cdc14e3ee603d7ec8`)
- Official Buzz 0.5.0 tag:
  `4a977c588a540be38bd8ddb268cd24437bac8165`
- Block release pull request: `block/buzz#3213`
- Night Mode pre-integration head:
  `14fbb26cb1606d31f404441bf61c033f4172c948`
- Night Mode integration merge:
  `ba58d5998a3019959937aee562686de42c382116`
- Rollback ref: `backup/night-mode-before-v0.5.0-2026-07-28`

The Night Mode branch already contained the complete 0.5.0 release-candidate
feature train. Its shared upstream base was
`3a4bf513df0e0c258587bfcbed9463d63723b56b`. The final tag added two commits:
the configurable Postgres pool from `block/buzz#3191` and the release version,
changelog, and lockfile update from `block/buzz#3213`. The merge was clean and
the resulting history contains the exact official tag.

The full official `v0.4.26..v0.5.0` range contains 87 first-parent commits
across 563 files. The release changelog curates 50 user-facing changes.
Post-release commits on `block/buzz:main` are intentionally outside this
integration.

## Official 0.5.0 feature map

### Agents, ACP, and harnesses

- Bring Your Own Harness adds built-in, preset, and user-defined ACP runtime
  tiers with one descriptor feeding discovery, readiness, model probing,
  process launch, and settings.
- Built-ins remain Goose, Claude Code, Codex, and Buzz Agent.
- Presets include Cursor, Oh My Pi, Grok Build, OpenCode, Kimi Code, Amp,
  Hermes Agent, and OpenClaw.
- Agent runtime settings, install reporting, model/provider authority, runtime
  lifecycle modules, concurrency accounting, mesh Auto routing, persona
  propagation, and onboarding were redesigned or hardened.
- Bundled Node moved to 24.15.0 for the OpenClaw runtime floor.

### Desktop product behavior

- Inbox and project-work views were refactored and gained richer previews and
  actions.
- Search gained `from:`, `in:`, `after:`, and `before:` operators.
- Composer formatting, pending-message state, thread anchoring, upward
  pagination, local-storage recovery, pairing, emoji search, and identity
  dialogs were corrected or expanded.
- Windows test, lint, and credential-helper support improved; Linux gained
  Wayland clipboard and broader AppImage compatibility.

### Relay, data, and security

- Use-limited invite links add tenant-bound, hashed codes with atomic use
  counts and expiration through migration `0025_relay_invites.sql`.
- Reconnect behavior, role changes, durable bans, agent-owner resolution,
  workflow handling, moderation details, telemetry, and Docker publication
  were updated.
- `BUZZ_DB_POOL_SIZE` now controls writer and optional reader pools and defaults
  to 50. Invalid or zero values fall back to 50.
- Nostr was updated to 0.44.6 for RUSTSEC-2026-0216.

### Mobile and dependencies

- Community, DM, invite, optimistic-posting, message-action, navigation,
  cold-start, reconnect, settings, and theme flows received updates.
- React, TanStack Virtual, Radix primitives, Android tooling, Mesh-LLM, and
  related lockfiles advanced with the release.

## Night Mode feature decisions

| Area | Decision for 0.5.0 |
| --- | --- |
| Provider allowance | Retain the provider-neutral Night Mode implementation. Consumer allowance is not API billing or observed token spend. |
| Categories/manual order | Retain the isolated category, ordering, pending-sync, and quiet-handle patches. |
| External agents | Retain exact-pubkey presentation and mention behavior. Never mint a managed replacement for an external identity. |
| Detached activity | Retain the small observer-capability patch over official ACP. |
| Grok | Use the official BYOH Grok descriptor. Keep an existing agent's native per-record path/model override when required. |
| Hermes | Use official BYOH architecture with the standard `hermes acp` launcher. Keep ALICE on her existing external VPS runtime and identity. |
| Gemini | Do not advertise a first-class Gemini harness without a real ACP-compatible adapter; 0.5.0 does not ship one. |
| Branding/updater | Retain fork-owned branding, updater trust, and release workflow. Never install an upstream binary over the customized client. |

## Validation contract

Completion is reported in separate layers:

1. Source: exact tag ancestry, focused tests, full CI, and a clean worktree.
2. Artifact: an exact-commit 0.5.0 app bundle with executable Buzz sidecars.
3. Installation: `/Applications/Buzz.app` replaced without changing the
   `xyz.block.buzz.app` data lineage.
4. Live UI: Night Mode attribution, provider cards, categories, runtime
   gallery, and updater boundary visible.
5. Live agents: the existing canonical local identities, ZERO, and external
   ALICE resolve by exact pubkey and complete real mention/reply checks.
6. Update: fork-signed N to N+1 installation and rollback proven before
   automatic-update readiness is claimed.

Source or upstream CI alone does not establish any later layer.
