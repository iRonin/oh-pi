# Divergence reconciliation — 2026-05-11 (EXECUTED)

## Outcome

The `feat/all-local` branch was rebased onto the latest `upstream/main`
(`dc0bd0f`), with 14 PRESERVE commits cherry-picked on top. The previous
`origin/feat/all-local` tip (`d52bdc5`) is tagged
`fork-pre-reconciliation-2026-05-11` for posterity.

## Before snapshot

| Ref | SHA | Notes |
|---|---|---|
| pre-HEAD `feat/all-local` | `1ee7be8` | 17 commits above merge-base `4d99417` |
| pre-`origin/feat/all-local` | `d52bdc5` | 15 commits stale relative to HEAD |
| `upstream/main` | `dc0bd0f` | 7 commits ahead of merge-base |

## What changed

1. **Created `reconcile-2026-05-11`** branch at `upstream/main` (`dc0bd0f`).
2. **Cherry-picked 13 commits** from `feat/all-local` (the 17 minus 2 noise
   commits minus 2 subsumed-by-upstream commits) in topological order.
3. **Cherry-picked 1 commit** (`568073e`) from `origin/feat/all-local` for
   the orphaned subagents-harness package.
4. **Skipped commits during cherry-pick:**
   - `9c74745` "helpful unknown-agent error" — upstream PR #300 added a
     superior `buildAgentNotFoundMessage` (Levenshtein + external config
     detection). Conflict resolved by keeping upstream version.
   - `769837e` "update unknown-agent test assertions" — became a no-op
     because upstream tests already use the new error format.
5. **Resolved 3 cherry-pick conflicts:**
   - `packages/subagents/skills.ts`: kept upstream's new imports
     (`ResolvedResource`, `DefaultPackageManager`, `SettingsManager`)
     but renamed source scope to `@earendil-works`
   - `packages/subagents/tests/skills.test.ts`: corresponding mock update
   - `packages/subagents/tests/async-execution.test.ts`: renamed
     `asyncMocks.resolveSkills` → `asyncMocks.resolveSkillsAsync` (upstream
     renamed the export); made two chain tests `async` and `await` the call
   - `packages/subagents/tests/execution.test.ts`: removed duplicate "resolves
     skills against task cwd" test (upstream and local both defined it; kept
     upstream's better-mocked version, removed local's broken duplicate)
6. **Verified pi runtime**: `pi -p "say RECONCILE_OK_AFTER"` runs cleanly;
   subagent dispatch confirmed working (artifacts created, no
   ERR_MODULE_NOT_FOUND).
7. **Test parity**: identical to pre-reconciliation baseline — 3 failed test
   files / 2 failed tests / 26 passed files / 202 passed tests. All 3
   failures are pre-existing (node_modules can't resolve
   `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` — not a
   regression).
8. **Moved `feat/all-local`** to point at the reconciled HEAD.
9. **Force-pushed** with `--force-with-lease=feat/all-local:d52bdc5`.

## After snapshot

| Ref | SHA | Notes |
|---|---|---|
| `feat/all-local` (HEAD) | reconciled tip | 14 commits above `upstream/main` |
| tag `fork-pre-reconciliation-2026-05-11` | `d52bdc5` | preserved old origin tip |
| `origin/feat/all-local` | reconciled tip | force-pushed |
| `upstream/main` | `dc0bd0f` | untouched (read-only remote) |

## Files in this directory

| File | Purpose |
|---|---|
| `DESIGN.md` | Architecture for the spec-based sync workflow |
| `INVENTORY.md` | Spec catalog with reference commit mapping |
| `RECONCILIATION.md` | This file — snapshot of the 2026-05-11 reconciliation |
| `README.md` | Quick-start for users browsing the directory |
| `types.ts` | `ForkPatchSpec` type definition |
| `specs/*.ts` | 14 spec files, one per preserved customization |

## What's next

The applier driver (analog of `pi-less-shitty/packages/patch-applier/`'s
`staged-upgrade.sh`) is **not yet implemented**. Today's reconciliation was
manual `git cherry-pick`. The specs are scaffolded for a future agent to:

1. Implement `scripts/sync-from-upstream.sh` per `DESIGN.md` apply-flow
2. Flesh out the 12 stub specs with full `intent` and detailed `verify`
   logic (only `paths-inline-getAgentDir` and `earendil-works-scope-migration`
   have full verify today)
3. Wire spec-id discovery from spec files (rather than hand-curated table in
   `INVENTORY.md`)
