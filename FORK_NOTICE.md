# Fork notice

Buzz Canary is an unofficial modified distribution of
[Block's Buzz](https://github.com/block/buzz), maintained by
[nytemode](https://nytemode.com). It is not affiliated with, endorsed by, or
supported by Block.

The upstream Apache-2.0 license and notices remain intact. Canary attribution is
additive and does not replace upstream authorship or trademarks.

Use the fork's `canary` branch and issue tracker for Canary-specific behavior.
Use upstream Buzz channels for issues reproduced on unmodified upstream code.

## Side-by-side agent identity

Official Buzz and Buzz Canary isolate application data, keyrings, deep links,
release channels, and updater trust. They do not isolate the owner's logical
agent team. When both clients use the same owner and community, Canary reuses
the existing relay-declared agent pubkeys and presents runtimes hosted by the
other client as `Managed elsewhere`.

Canary must not mint, import, clone, provision, start, or draft replacement
agents without explicit owner approval. A request to update or repair an
existing agent does not authorize a new identity.
