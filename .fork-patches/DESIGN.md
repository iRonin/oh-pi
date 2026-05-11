# oh-pi fork-patches — design

Mirror of the `pi-less-shitty/packages/patch-applier` model, adapted for a
**source-tree fork** instead of an installed npm dist.

## Why this exists

`iRonin/oh-pi` is a personal fork of `ifiokjr/oh-pi`. Upstream doesn't accept
all our customizations, so the fork carries persistent local patches. Without
a discipline, `feat/all-local` drifts unboundedly from `upstream/main` and
upstream sync becomes a quarterly archaeology project.

The pi-less-shitty patch-applier solves this for installed dist files by
making each patch a **durable spec** (intent + verify) with text edits
re-derived by an AI agent against the current dist. We do the same for oh-pi,
but the apply target is the source tree of `feat/all-local` rebuilt from
`upstream/main`, and the primary apply mechanism is **git cherry-pick** with
AI re-derivation as the conflict fallback.

## Anatomy of a patch

Each patch lives at `.fork-patches/specs/<id>.ts` and exports a `ForkPatchSpec`:

```ts
interface ForkPatchSpec {
  /** Stable identifier — e.g. "paths-inline-getAgentDir". */
  id: string;

  /** Files this patch is allowed to touch (relative to repo root). */
  targets: string[];

  /** Plain-language description: what behavior changes, where, why. */
  intent: string;

  /** Optional hint for the applier agent (pseudocode or before/after sketch). */
  hint?: string;

  /**
   * Canonical "good" commit in the fork that demonstrates the patch.
   * Used as the cherry-pick source on each upstream sync. When the
   * cherry-pick succeeds clean, no AI work is needed.
   */
  referenceCommit: string;

  /**
   * Programmatic verification against working-tree contents.
   * Receives a function to read any target file; returns ok or failure list.
   * MUST verify behavioral intent, not specific text shape.
   */
  verify: (readTarget: (path: string) => string) => VerifyResult;
}

type VerifyResult = { ok: true } | { ok: false; failures: string[] };
```

## Apply flow

`./scripts/sync-from-upstream.sh` drives the end-to-end sync:

1. `git fetch upstream`
2. `git checkout -B sync-staging upstream/main`
3. For each spec in `.fork-patches/specs/`, in declared order:
   a. `git cherry-pick <spec.referenceCommit>` — if clean, run `spec.verify(...)` against the new tree
   b. **If cherry-pick conflicts** OR **verify fails** after a clean cherry-pick:
      - Abort the cherry-pick (`git cherry-pick --abort`)
      - Dispatch a fresh subagent with `{ spec.intent, spec.hint, current file contents, verify failures }`
      - Agent produces minimal find/replace edits per target
      - Apply, re-verify
      - On success: `git commit` with the spec id in the message
4. `npm install && vitest run packages/subagents/tests` smoke test
5. On all-green: print a recommended fast-forward command for `feat/all-local`
   (the script never force-pushes — leaves that to the human)
6. On failure: leave `sync-staging` for inspection, report which spec failed

This mirrors pi-less-shitty's `staged-upgrade.sh` flow: stage → apply → verify
→ smoke test → atomic swap is gated by human review.

## Why git cherry-pick first, AI second

For pi-less-shitty the apply target is a built `.js` dist — the AI is the only
realistic option because the dist shape changes every npm release. For oh-pi
the apply target is a versioned **source tree** with full git history, so
cherry-pick is the natural primitive when upstream hasn't touched the same
lines. Falling back to AI only on conflict (or verify failure) keeps the
common case fast and explainable.

## Repository layout

```
~/Work/Pi-Agent/oh-pi/
└── .fork-patches/
    ├── DESIGN.md                  (this file)
    ├── INVENTORY.md               (catalogue of all patches, intent, status)
    ├── specs/
    │   ├── paths-inline-getAgentDir.ts
    │   ├── widget-per-step-model.ts
    │   ├── known-custom-tools-absolute-path.ts
    │   ├── read-full-via-local-path.ts
    │   ├── cascading-skill-discovery-clarify.ts
    │   ├── skills-resolved-against-task-cwd.ts
    │   ├── custom-tool-name-resolution.ts
    │   ├── async-subagent-steering.ts
    │   ├── helpful-unknown-agent-error.ts
    │   ├── verbose-call-params-render.ts
    │   ├── configurable-parallel-limits.ts
    │   ├── exclude-builtins-config.ts
    │   ├── earendil-works-scope-migration.ts
    │   └── test-updates.ts        (test fixtures aligned with patches above)
    └── scripts/
        ├── sync-from-upstream.sh  (analog of staged-upgrade.sh)
        └── verify-all.ts          (run every spec.verify against current tree)
```

The `.` prefix avoids most upstream conflicts. `.fork-patches/` is a
deliberate, scope-prefixed name; upstream is highly unlikely to introduce a
directory by that name.

## Hard guarantees

1. **Never force-push from the script.** Atomic-swap-equivalent is `git update-ref`
   on a local branch only; pushing to `origin/feat/all-local` is always manual.
2. **Verify gates correctness.** Each spec's `verify()` must pass before the
   patch is considered applied. A passing cherry-pick with failing verify is
   treated as a failure (file moved or upstream changed semantics).
3. **One commit per patch.** Patch commits are not squashed during sync — they
   stay distinct so each is traceable to its spec id (via commit message
   trailer `Patch-Id: <spec.id>`).
4. **Failures leave the live install untouched.** The script only modifies
   a `sync-staging` branch; `feat/all-local` HEAD is moved only by explicit
   human action after review.

## Migration path

This design is **research-phase**, not yet implemented. The first spec
(`paths-inline-getAgentDir`) is fully fleshed out below as a worked example.
Remaining specs are stubs that need verify-function design.

## Open questions

See `INVENTORY.md` "Open questions" section.
