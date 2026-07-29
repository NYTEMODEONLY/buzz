# nytemode integration audit: Buzz 0.5.1

## Audited state

- Official Buzz 0.5.0 tag:
  `4a977c588a540be38bd8ddb268cd24437bac8165`
- Official Buzz 0.5.1 tag and verified release commit:
  `a13085e9ac9a7c8dbd9426a6b88fc75abf62220e`
- nytemode pre-integration head:
  `97f684b91692714f30a28106b5c038d93def60b6`
- nytemode integration merge:
  `a2310765d3d124d1549a41ef05eefa3f5cdbf36b`
- Rollback ref:
  `backup/nytemode-before-v0.5.1-2026-07-29`

The official range contains 37 commits across 288 files. The two histories had
12 overlapping paths and three textual conflict files:

- `desktop/playwright.config.ts`
- `desktop/src/features/agents/AGENTS.md`
- `desktop/src/features/agents/ui/AgentsView.tsx`

The resolution keeps the official relay-backed persona catalog, inline custom
harness flow, agent-card grid, sharing fidelity, ACP steering, gateway routing,
and 0.5.1 fixes. It also retains nytemode provider allowance, exact-pubkey
managed identity authority, external-agent presentation, launchable-persona
filtering, detached observer capability, and sidebar categories/manual order.

## Updater finding

The pre-integration installed app was a 0.5.0 ad-hoc local bundle whose updater
plugin had been compiled out. The configured fork feed did not exist:
`NYTEMODEONLY/buzz` had no releases or release workflow runs, and
`buzz-nytemode-latest/latest.json` returned 404.

Block's updater cannot be reused as a binary feed. Its archive is a complete
stock `Buzz.app` signed by Block's updater key; accepting it would replace the
customized app rather than merge official source changes.

The repaired design has two lanes:

1. Production: exact Block tags are proposed against `fork/main`; immutable
   `nytemode-vX.Y.Z` tags build a complete customized app, publish versioned
   signed artifacts, then promote the fork-owned manifest last. This remains
   fail-closed until Developer ID signing and notarization secrets exist.
2. Local engineering: a loopback-only feed can exercise the same Tauri
   signature/download/replacement path without publishing an unnotarized app.
   It uses immutable versioned local artifacts and the committed updater public
   key, and is never a public release claim.

## Source validation recorded during integration

- TypeScript typecheck passed.
- Desktop helper tests passed: `3843/3843`.
- `buzz-acp` library tests passed: `632/632`.
- nytemode release and naming contracts passed.

Artifact, installation, live UI/agent, and N to N+1 updater evidence remain
separate release gates.
