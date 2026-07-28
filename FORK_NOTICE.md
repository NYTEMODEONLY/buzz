# Fork notice

Buzz Night Mode Edition is an unofficial modified distribution of
[Block's Buzz](https://github.com/block/buzz), maintained by
[nytemode](https://nytemode.com). It is not affiliated with, endorsed by, or
supported by Block.

The upstream Apache-2.0 license and notices remain intact. Night Mode Edition
attribution is additive and does not replace upstream authorship or trademarks.

Use this repository for Night Mode Edition behavior. Report an issue upstream
only after reproducing it on an unmodified upstream build.

## One-client identity contract

Night Mode Edition intentionally uses Buzz's main product name, bundle
identifier, application data, keyring service, and `buzz:` deep link. It
replaces the locally installed Buzz client; it is not a side-by-side edition.

An application upgrade must preserve every existing owner and managed-agent
key. An empty registry, an unavailable archive, or a matching display name
never authorizes minting, cloning, importing, or provisioning a replacement
agent. Existing agents are resolved by exact pubkey.

## Update trust

Night Mode Edition binaries update only from releases owned by
`NYTEMODEONLY/buzz` and signed by the fork's updater key. Upstream source is
reviewed and merged into this fork; an upstream Block binary must never be
installed over the customized client automatically.
