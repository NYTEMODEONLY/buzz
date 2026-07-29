# nytemode updater trust

`nytemode-updater.pub` is the public half of the Tauri updater signing key.
Release and local updater builds must embed this exact value. Its SHA-256
fingerprint, computed after removing line endings, is:

```text
7cf91c1e8ab00e77dda369a326f91b9e10ff738c3a8c3b48c88eff7ca48a8e82
```

The private half is never committed. It is backed up separately and, on the
canonical local build machine, stored at
`~/.buzz/nytemode-updater/keys/nytemode.key` with mode `0600`.

Losing the private key strands installed updater-enabled clients. Replacing it
silently makes every existing client reject future updates. A key rotation
therefore requires a transition release signed by the old key and embedding
the new public key.
