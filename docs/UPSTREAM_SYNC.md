# Upstream sync

`main` is the clean mirror. `canary` is the integration branch.

1. Fetch `block/buzz:main` and fast-forward fork `main` to the exact upstream
   SHA. Never merge Canary into it.
2. Merge updated upstream `main` into a temporary Canary sync branch.
3. Resolve conflicts in custom features at their original boundaries. Remove
   any patch that upstream has absorbed.
4. Run the full Desktop gate and feature-specific regression tests.
5. Merge the reviewed sync into `canary`.
6. Build and exercise one installed Canary from that exact SHA.
7. Release only after the updater and rollback drills in
   [RELEASING_CANARY.md](RELEASING_CANARY.md) pass.

Upstream PR branches are always cut from current upstream `main`, never from
`canary`. This keeps community distribution work from contaminating patches
submitted to Block.
