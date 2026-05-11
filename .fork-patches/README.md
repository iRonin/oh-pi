# `.fork-patches/` — Fork customization specs

Persistent local customizations for `iRonin/oh-pi` (a fork of `ifiokjr/oh-pi`).

Mirrors the design of `pi-less-shitty/packages/patch-applier/`, adapted from
binary dist patching to source-tree patching:
- pi-less-shitty patches a built `.js` dist (single mechanism: AI text edits)
- oh-pi patches a versioned source tree (two mechanisms: `git cherry-pick` first,
  AI re-derivation only on conflict)

See `DESIGN.md` for the full rationale.

## What lives here

| File | Purpose |
|---|---|
| `DESIGN.md` | Architecture rationale and apply-flow design |
| `INVENTORY.md` | Catalogue of every spec, mapped to its reference commit |
| `RECONCILIATION.md` | Snapshot of the 2026-05-11 reconciliation (this branch's origin) |
| `types.ts` | `ForkPatchSpec` type definition |
| `specs/*.ts` | One file per durable customization; `id`, `targets`, `intent`, `referenceCommit`, `verify()` |
| `scripts/` | (Future) `sync-from-upstream.sh` and `verify-all.ts` |

## Current state — Phase 1: specs exist, applier not built

Only the spec definitions are committed. The applier driver script
(`scripts/sync-from-upstream.sh`) is **not yet implemented**. The intended
flow is documented in `DESIGN.md`; building it is a future task.

**Today's workflow** for syncing from upstream is still manual:
```
git fetch upstream
git switch -c reconcile-<date> upstream/main
# cherry-pick the 14 patch commits in order:
git cherry-pick $(grep -h '^export const referenceCommit' .fork-patches/specs/*.ts | ...)
# resolve any conflicts, run npm test, then:
git branch -f feat/all-local <new-sha> && git push origin feat/all-local --force-with-lease
```

The 14 reconciled commits on top of `upstream/main` (`dc0bd0f`) are listed in
`INVENTORY.md`.

## Reference: a complete spec

`specs/paths-inline-getAgentDir.ts` is the worked example — full intent,
hint, multi-check verify. Other specs are stubs that should be filled in
when the applier is built.

## How to add a new patch

1. Make the change as a normal commit on `feat/all-local`
2. Create `.fork-patches/specs/<id>.ts` exporting a `ForkPatchSpec`:
   - `id`: kebab-case unique identifier
   - `targets`: relative file paths touched
   - `intent`: plain-language description, must survive being read 6 months later
   - `referenceCommit`: SHA of the commit you just made
   - `verify`: programmatic check that confirms the behavior is present
3. Add the spec to the table in `INVENTORY.md`
4. Commit the spec on `feat/all-local` (specs live ON the fork branch — they
   are not in `upstream/main`)

## Why this lives in `feat/all-local`, not main

The specs are deliberately scoped to the fork. They describe customizations
on top of upstream, so they belong on the customization branch. If they were
on `main` they would be carried into every upstream sync and could conflict
with upstream's own files (extremely unlikely with the `.fork-patches/`
naming, but principle of least surprise applies).
