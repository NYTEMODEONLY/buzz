# Buzz Canary changelog

## Unreleased

- Added first-class sidebar categories and exact manual channel ordering,
  including pointer and keyboard movement, empty-category targets, safe
  rename/delete behavior, and encrypted relay-scoped synchronization.
- Fixed a startup synchronization race that could briefly create and then
  remove a category before its encrypted local edit reached the relay.
- Hid channel drag handles at rest on hover-capable devices while keeping them
  visible on row hover, keyboard focus, active drag, and non-hover/touch input.
- Fixed draggable channel rows becoming visually blank in WKWebView while
  remaining present in the DOM and accessibility tree.
- Integrated the Hermes ACP and external-agent feature stack.
- Added detached external-agent activity transport.
- Added local provider allowance visibility for Codex with honest unsupported
  states for Claude and Grok.
- Added Grok Build as a first-class native ACP harness with onboarding
  selection, Grok 4.5 model discovery, managed headless defaults, and xAI
  authentication guidance.
- Documented the one-team cross-client contract: official Buzz and Canary
  reuse the same owner-managed agent pubkeys, and no replacement or sibling
  identity may be created without explicit owner approval.
- Added Canary-only footer attribution to nytemode.
- Isolated Canary app data, keyring, deep links, release links, and updater
  trust from official Buzz.
