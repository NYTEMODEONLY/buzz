# Agent Configuration — Contributor Rules

Scope: `desktop/src/features/agents/` (config surfaces, shared config renderer,
and the agent config core). Read this before changing how harness / provider /
model / effort configuration is modeled, rendered, persisted, or applied.

Plan of record: `Buzz/Harness-Provider-Model.md` in Morgan's Obsidian vault
(PR sequence, decisions log). PRs: #2140 (rename), #2148 (flag reduction),
#2156 (honest model states), #2158 (Agent Config Core).

## The one rule

**Harness capability facts have exactly one source: the Rust runtime catalog.**
`KnownAcpRuntime` (`desktop/src-tauri/src/managed_agents/discovery/runtime_metadata.rs`)
declares each harness's model/provider/effort env keys and capabilities. Spawn
applies them; `AcpRuntimeCatalogEntry` exposes them over IPC; and
`lib/agentConfigCore.ts` projects them into field descriptors. The frontend
never maintains a rival copy of this table.

If you need a new capability fact (a new env key, a native option, a "supports
X" flag): add it to `KnownAcpRuntime` first, expose it on
`AcpRuntimeCatalogEntry`, then project it through the core. Do not shortcut
with a TypeScript lookup table or an id comparison in a component.

Adding a runtime follows the same rule: declare its command aliases, default
arguments, install/readiness metadata, and configuration capabilities in the
Rust catalog. Catalog-driven setup and selection surfaces should pick it up
without a parallel TypeScript runtime list.

## Rules

1. **No hardcoded harness-ID checks in render code.** `runtime.id === "claude"`
   belongs in `deriveAgentConfigFieldModel` (once, with a named reason), never
   in a component. Components ask the field model what exists
   (`hasRenderableAgentConfigField`, `getRenderableEffortField`).
2. **Effort reads/writes go through the descriptor.** Use the effort
   descriptor's `currentPersistence` key — never a raw
   `BUZZ_AGENT_THINKING_EFFORT` literal in UI code. `currentPersistence` is
   where the value lives *today*; `targetApplication` is how the harness
   *should* receive it. They intentionally differ until PR 2.7 migrates
   Goose/Claude — do not "fix" one to match the other without doing the
   migration work.
3. **Field absence has a named reason, not a boolean.** Codex effort is
   `ownedByModelId`; Claude effort is `deferredUntilNativeOptionsAvailable`.
   New absences get new named reasons in `AgentConfigOmission` /
   `render` — never a `showX` prop.
4. **The clearing policy is the named types.** `onContextChange:
   "resetDependentValues"` (user changed harness/provider → dependent values
   reset everywhere) vs `onCatalogMismatch: "explainOnly" | "onboardingCleanup"`
   (an async catalog miss never silently erases saved state outside
   onboarding's named cleanup). Do not add mutation booleans like
   `clearInvalidModel`; extend the policy types.
5. **"Metadata unknown" ≠ "harness lacks the capability".** Passing
   `runtime: undefined` to the core means fields won't render. Surfaces must
   gate on the runtime catalog query settling (loading/error states) rather
   than letting fields silently vanish — see `AgentDefaultsEditor` /
   `DefaultConfigStep` for the pattern.
6. **One canonical behavior, disclosure presets for visibility.** Behavior
   flags were deliberately killed in #2148 (`CANONICAL_CONFIG_BEHAVIORS`).
   Surface differences are expressed via the `disclosure` preset, not new
   boolean props.  **Exception:** `onboarding-essential` hides happy-path
   helper copy (provider/model descriptions) but a non-null model-discovery
   status always bypasses the preset and renders the status line — enforced
   via `shouldShowModelStatusMessage()` (`AgentConfigFields.tsx`).
   Additionally, a successful discovery response that yields no usable options
   (`supportsSwitching:false` or empty model list) synthesizes a warning status
   via `synthesizeEmptyDiscoveryStatus()` and is intentionally **not cached**
   so that closing → reopening the dialog re-runs discovery after the user
   installs or signs into the CLI (`isCacheableDiscoveryResponse()`).
7. **Onboarding setup detects readiness; it does not select defaults.** The
   setup page derives visible and ready harnesses from the runtime catalog and
   only offers install or sign-in actions. The following defaults page is the
   sole onboarding surface that chooses and persists `preferred_runtime`.
   `onboarding-agent-defaults.spec.ts` is the acceptance gate for anything
   touching this flow or the shared renderer.
8. **Omit the Model control only after a confirmed successful empty
   discovery on an optional-model harness.** When the field model marks model
   as `acpNative` (Claude Code / Codex), `shouldRenderModelControl` hides the
   picker while discovery is in flight and after IPC resolves with no usable
   options (`modelDiscoverySuccessfulEmpty` / `isSuccessfulEmptyDiscovery`).
   A thrown or unavailable discovery keeps the control so #2246 failure UI can
   render, and must not heal/clear persisted model or effort. Full disclosure
   still shows the control when Custom model is available. Required-model
   harnesses always keep the field. Gate: `defaults hides model when optional
   harness has empty discovery` (and the failed-discovery counterpart) in
   `onboarding-agent-defaults.spec.ts`.
9. **The defaults modal is progressively disclosed.** An unset global config
   starts on the Buzz Agent-first deployment fallback and carries that visible
   harness into the next saved edit. The `progressive-defaults` disclosure
   preset therefore begins at Provider for Buzz Agent, then reveals Model,
   Effort, and Advanced only after a provider is configured. Harnesses whose
   runtime metadata has no provider field skip that gate. Reveals animate their
   height through Motion and become immediate when reduced motion is requested.
   Once the Advanced toggle is visible, its expanded state is exclusively
   user-controlled: provider, harness, and required-env changes must never
   open it automatically in defaults, create, or edit flows. In Create mode,
   the defaults summary follows preferred-harness changes saved while the
   dialog is open, and its configured state includes required credentials as
   well as provider/model values. If no available harness can resolve, Create
   starts in Customize and lets unavailable catalog entries be selected only
   to expose their setup guidance; submission remains blocked.
   Advanced-only required credentials mark the collapsed Advanced toggle
   without opening it in Global Defaults and Edit, and block incomplete saves.
   Runtime-file credentials satisfy Global Defaults just as they do Create and
   Edit. In Edit,
   selecting Custom command keeps its required command field beside the harness
   picker rather than hiding it in Advanced.
10. **External agents are relay identities, not shadow managed agents.** Their
   runtime, prompts, memory, provider, skills, and identity stay on the external
   host. Desktop may persist an owner-scoped presentation name/avatar, but that
   presentation must flow through the shared profile query layer so cards,
   profiles, messages, mentions, DMs, and sidebars agree. Never write the
   presentation back to kind `0` or external runtime files. A policy-only kind
   `10100` record is not a directory declaration and must not become a key-only
   external card; directory entries require a non-empty `name` or
   `display_name`. Card liveness comes from live kind `20001` presence, never a
   persisted `status` field in kind `10100`. Cross-install classification uses
   the current owner's kind `30177` managed-agent coordinates: an agent managed
   by another isolated Buzz Desktop install is still managed, not external.
   A client without that agent's key renders it as `Managed elsewhere`, keeps
   runtime/edit controls disabled, and continues using the same pubkey for
   profiles, mentions, messages, DMs, activity, and memory. A complete remote
   built-in Welcome Team suppresses local Welcome-team provisioning; never mint
   same-persona replacements just because the local keyring is isolated. Hide
   local launch controls for a persona already declared by an owner-managed
   remote agent. Broad directory queries may hit relay result caps, so fetch
   owner-managed kind `10100` profiles by their exact authors as a second lane.
   Kind `30177` remains identity-authoritative when a usable kind `10100`
   profile is missing: synthesize the minimal managed card from the declaration
   and preserve its canonical pubkey instead of exposing a local launch path.
   In nytemode's side-by-side Main/Canary installation, this is an explicit
   one-team contract: an empty local registry or isolated keyring never
   authorizes minting, importing, cloning, provisioning, starting, or drafting
   a replacement. A new agent or sibling identity requires the owner's explicit
   approval; update, rename, repair, configuration, visibility, and client-sync
   requests are not creation approval. Snapshot/team import creates fresh
   keypairs and is not identity reuse.
   An owner may explicitly remove a relay-only stale kind `30177` declaration,
   but that action must publish only the owner-authored NIP-09 coordinate
   deletion and must not archive the identity, alter channel membership, or
   touch a runtime/key. Locally managed agents stay on the full Delete agent
   flow so their coupled resources cannot be orphaned. Discovery must also
   honor that exact owner-authored coordinate tombstone as a retirement marker
   for the agent's durable kind `10100` profile; otherwise a successfully
   removed legacy agent falls back to an `External` duplicate card. A newer
   live kind `30177` declaration explicitly resurrects the profile.
   Relay-authoritative archived identities stay out of forward-looking agent
   discovery even while their durable directory profiles remain. The directory
   card's runtime label comes from kind `10100` `agent_type`.
11. **Owner-declared relay agents participate in observer ingestion.** An
   external agent with a verified NIP-OA owner belongs in the app-global
   kind-`24200` ingestion list as `deployed`; non-owned and owner-unknown relay
   agents stay excluded. Activity UI must use the combined managed + eligible
   relay-agent candidate list, while interrupt/runtime controls remain local
   only.

## The tests that enforce this

- `lib/agentConfigCore.test.mjs` — field model per harness × scope, clearing
  policy. Update when the capability model changes.
- `ui/agentConfigFieldsContract.test.mjs` — canonical behaviors + disclosure
  presets + `shouldShowModelStatusMessage` status-bypass +
  `shouldRenderModelControl` (successful-empty omit vs failure keep). If this
  fails, you probably reintroduced a per-surface flag or conflated empty with
  failed discovery.
- `ui/usePersonaModelDiscovery.test.mjs` — `synthesizeEmptyDiscoveryStatus`,
  `isCacheableDiscoveryResponse`, `deriveModelDiscoveryPending`,
  `isSuccessfulEmptyDiscovery`. If the "reopen to retry" copy becomes inert
  again, these tests will catch it.
- `desktop/tests/e2e/onboarding-agent-defaults.spec.ts` — onboarding behavior
  acceptance coverage for readiness, failure states, defaults, navigation,
  successful-empty vs failed optional-model discovery, and persistence races.
- `externalAgentPresentation.test.mjs` and
  `desktop/tests/e2e/agents.spec.ts` — owner presentation propagation across
  profile-backed surfaces and external-agent Activity ingress.
- `useAgentObserverIngestion.test.mjs` — verified-owner relay agents join
  global observer ingestion without admitting unrelated relay identities.
- Rust: `runtime_metadata_env_vars` tests pin spawn-time key application.

## Keep this file true

**If you change how agent configuration is modeled, rendered, persisted,
applied, or cleared — update this file in the same PR.** A rule that no longer
matches the code is worse than no rule; a new pattern that isn't written down
here will be broken by the next agent that never learns it existed. Reviewers:
treat a config-behavior diff without a matching AGENTS.md diff (or an explicit
"no rules changed" note) as incomplete.
