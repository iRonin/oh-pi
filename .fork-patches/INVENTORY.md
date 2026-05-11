# oh-pi fork-patches — inventory

Catalogue of every local-only customization on `feat/all-local` (post
2026-05-11 reconciliation) above `upstream/main`. One spec per logical patch.

## Reconciled baseline (2026-05-11)

- Pre-reconciliation HEAD: `1ee7be8` on `feat/all-local`
- Pre-reconciliation `origin/feat/all-local`: `d52bdc5` (tagged as
  `fork-pre-reconciliation-2026-05-11` for safety)
- Reconciled HEAD on `feat/all-local`: see `git log upstream/main..HEAD` —
  14 commits above `upstream/main` (`dc0bd0f`)

The reconciliation rebased onto current upstream/main, dropped 2 noise
commits (DEBUG_SUBAGENT add + revert), and added the previously stranded
`subagents-harness` package from origin.

## Spec catalog (14 specs)

| Spec id | Reference commit | Source provenance | Status |
|---|---|---|---|
| `exclude-builtins-config` | `44fd95a` | feat/all-local 417f103 | stub |
| `configurable-parallel-limits` | `d853301` | feat/all-local d1ea615 | stub |
| `verbose-call-params-render` | `45e1850` | feat/all-local 205add5 | stub |
| `custom-tool-name-resolution` | `5df7b51` | feat/all-local 8a27c94 | stub |
| `skills-resolved-against-task-cwd` | `19cfd2f` | feat/all-local 17072da | stub |
| `test-cwd-fallback-coverage` | `864df67` | feat/all-local 4fffedd | stub |
| `async-subagent-steering` | `61d0e8a` | feat/all-local da03947 | stub |
| `read-full-local-path` | `d268f3d` | feat/all-local dfc4620 | stub |
| `cascading-skill-discovery-clarify` | `ee9a745` | feat/all-local 60bc44d | stub |
| `known-custom-tools-absolute-path` | `6861a20` | feat/all-local 3887450 | stub |
| `earendil-works-scope-migration` | `a9881f7` | feat/all-local 8ffbfd2 | ✅ full verify |
| `paths-inline-getAgentDir` | `e7d6961` | feat/all-local 37abe4b | ✅ full verify (worked example) |
| `widget-per-step-model` | `036d7fa` | feat/all-local 1ee7be8 | stub |
| `subagents-harness-package` | `f652181` | origin/feat/all-local 568073e | stub |

## Commits explicitly dropped during reconciliation

### Pre-reconciliation `feat/all-local` (17 → 13 preserved, 2 dropped, 2 subsumed)

| Original SHA | Subject | Outcome | Reason |
|---|---|---|---|
| `187c7c2` | debug: add DEBUG_SUBAGENT=1 | DROPPED | reverted by 9108834 — net zero |
| `9108834` | Revert "debug: add DEBUG_SUBAGENT=1" | DROPPED | revert of above |
| `9c74745` | fix(subagents): helpful unknown-agent error | SUBSUMED | upstream PR #300 added superior `buildAgentNotFoundMessage` with Levenshtein + external config detection |
| `769837e` | test: update unknown-agent assertions | SUBSUMED | upstream tests already use the new error format |

### Pre-reconciliation `origin/feat/all-local` (15 → 1 preserved, 14 dropped)

| Original SHA | Subject | Outcome | Reason |
|---|---|---|---|
| `568073e` | feat(subagents-harness): orchestration test harness | PRESERVED | net-new, no equivalent on upstream or HEAD |
| `d52bdc5` | helpful unknown-agent error | DROPPED | upstream PR #300 supersedes |
| `b6fb412` | define missing buildCallDetailBlock | DROPPED | already in 45e1850 |
| `edfbc1f` | verbose call params | DROPPED | re-implemented as 45e1850 |
| `06b3325` | 'missing is not defined' crash fix | DROPPED | execution.ts refactored upstream; path gone |
| `c739c8e` | inherit session model | DROPPED | upstream `findAvailableModel(currentModel, ...)` does this |
| `42225d3` | cascading agent discovery | DROPPED | upstream `findProjectAgentsDirs` does this |
| `fcd9c5e` | wrap async widget debug | DROPPED | already in HEAD |
| `a29ecff` | parse errors fixup | DROPPED | follow-up fixup, no behavior |
| `7044cdc` | configurable parallel limits | DROPPED | re-implemented as d853301 |
| `090df89` | excludeBuiltins | DROPPED | re-implemented as 44fd95a |
| `2e137af` `acea5b7` `0c36c84` `f449fc8` | merge commits | DROPPED | merge-only, no content |

## Open questions

1. **When upstream `ifiokjr/oh-pi` migrates to `@earendil-works` scope**, retire
   `earendil-works-scope-migration` from this inventory.
2. **The subagents-harness package** at `packages/subagents-harness/` only has
   `tests/`; no `src/`. The empty `src/` directory in the working tree (before
   reconciliation) was orphan state. Consider whether the harness should grow
   into a proper library or remain test-only.
3. **Applier driver script** (analog of `staged-upgrade.sh`) is NOT YET BUILT.
   See `DESIGN.md` for the intended flow. Today's reconciliation was performed
   manually using `git cherry-pick`.
