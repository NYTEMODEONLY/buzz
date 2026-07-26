# Buzz Canary changelog

## Unreleased

- Added first-class sidebar categories and exact manual channel ordering,
  including pointer and keyboard movement, empty-category targets, safe
  rename/delete behavior, and encrypted relay-scoped synchronization.
- Fixed a startup synchronization race that could briefly create and then
  remove a category before its encrypted local edit reached the relay.
- Integrated the Hermes ACP and external-agent feature stack.
- Added detached external-agent activity transport.
- Added local provider allowance visibility for Codex with honest unsupported
  states for Claude and Grok.
- Added Canary-only footer attribution to nytemode.
- Isolated Canary app data, keyring, deep links, release links, and updater
  trust from official Buzz.
