# oh-pi fork-patches — usage

Tooling to keep `feat/all-local` reconciled with `upstream/main` while
preserving 15 local customizations. Mirror of pi-less-shitty's
`staged-upgrade.sh` flow.

## Quick reference

```bash
# Verify all specs against current worktree (read-only)
cd ~/Work/Pi-Agent/oh-pi
npx tsx .fork-patches/cli.ts --check

# List specs in commit-chronological order
npx tsx .fork-patches/cli.ts --list

# Full sync: stage → cherry-pick → AI fallback → verify → smoke test
~/Work/Pi-Agent/pi-less-shitty/scripts/oh-pi-staged-upgrade.sh

# Show what the upgrade would do without writing
~/Work/Pi-Agent/pi-less-shitty/scripts/oh-pi-staged-upgrade.sh --dry-run

# Skip the vitest step (much faster, useful for iterating on specs)
~/Work/Pi-Agent/pi-less-shitty/scripts/oh-pi-staged-upgrade.sh --no-tests
```

## Architecture

### Files
```
~/Work/Pi-Agent/oh-pi/.fork-patches/
├── DESIGN.md                    architectural rationale
├── INVENTORY.md                 catalogue of 15 specs + reconciliation history
├── README.md                    top-level pointer (read this first)
├── RECONCILIATION.md            2026-05-11 reconciliation playbook
├── USAGE.md                     this file
├── applier.ts                   cherry-pick-first apply engine + AI fallback
├── cli.ts                       command-line driver
├── types.ts                     ForkPatchSpec interface
└── specs/
    ├── async-subagent-steering.ts
    ├── cascading-skill-discovery-clarify.ts
    ├── configurable-parallel-limits.ts
    ├── custom-tool-name-resolution.ts
    ├── earendil-works-scope-migration.ts
    ├── exclude-builtins-config.ts
    ├── known-custom-tools-absolute-path.ts
    ├── paths-inline-getAgentDir.ts
    ├── post-cherry-pick-fixups.ts
    ├── read-full-local-path.ts
    ├── skills-resolved-against-task-cwd.ts
    ├── subagents-harness-package.ts
    ├── test-cwd-fallback-coverage.ts
    ├── verbose-call-params-render.ts
    └── widget-per-step-model.ts

~/Work/Pi-Agent/pi-less-shitty/scripts/
└── oh-pi-staged-upgrade.sh      end-to-end orchestrator
```

### Apply order

`cli.ts` sorts specs by `git show -s --format=%ct <referenceCommit>` so
prerequisite patches apply before dependents. Falls back to alphabetical
when a commit can't be resolved (e.g. `--list` without `--repo`).

### Cherry-pick first, AI second

For each spec, in chronological order:

1. **Fast path** — run `spec.verify(readTarget)` against the staging tree.
   If it passes, mark `already` and skip. Common when upstream subsumed
   the patch.
2. **Cherry-pick** — `git cherry-pick <spec.referenceCommit>` in the
   staging clone. If clean and verify still passes, mark `applied-cherry-pick`.
3. **AI fallback** — if cherry-pick conflicts OR if the resulting tree
   fails verify, abort the cherry-pick, dispatch a fresh `pi` subprocess
   with `{ spec.intent, spec.hint, current file content, verify failures }`
   and ask for a JSON `{"replacements":[{"find":"...","replace":"..."}]}`.
   Apply edits, re-verify, commit on success.
4. **Fail loud** — if AI returns no edits or the verify still fails after
   AI edits, return `status: "failed"`. The script keeps the staging tree
   for inspection and exits 1.

AI fallback is **limited to specs with a single target file**. Multi-file
specs that conflict require a human.

## Adding a new spec

1. Make the change locally on `feat/all-local` (or a topic branch), test,
   commit. Note the commit SHA.

2. Create `.fork-patches/specs/<id>.ts`:

```ts
import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
    id: "your-spec-id",
    targets: ["packages/subagents/foo.ts"],  // primary files this touches
    referenceCommit: "abc1234...",            // canonical fork commit
    intent: "Plain-language description of what behavior changes and why.",
    hint: `Before:
    bad pattern

After:
    good pattern`,                            // optional: helps AI on conflict
    verify(readTarget) {
        const content = readTarget("packages/subagents/foo.ts");
        const failures: string[] = [];
        if (!/desired pattern/.test(content)) {
            failures.push("foo.ts: missing desired pattern");
        }
        return failures.length === 0 ? { ok: true } : { ok: false, failures };
    },
};
```

3. Run `--check` from the live worktree to confirm the verify passes there:
   `npx tsx .fork-patches/cli.ts --check --spec your-spec-id`

4. Run the full upgrade end-to-end to confirm the replay reproduces the
   patch atop a fresh upstream/main:
   `~/Work/Pi-Agent/pi-less-shitty/scripts/oh-pi-staged-upgrade.sh --no-tests`

5. Commit the new spec to `feat/all-local`. Update `INVENTORY.md`.

### Verify guidelines

- **Verify behavioral intent, not text shape.** Survives upstream
  refactors. Anchor on stable API names (`resolveSubagentLimits`,
  `KNOWN_CUSTOM_TOOLS`), not on indentation or specific phrasing.
- **Include test files in `verify` if they list test files in `targets`.**
  Otherwise the spec passes against upstream but the dependent patches
  (which expect the tests as anchors) can't cherry-pick.
- **Surface uncertainty.** A verify that can't decide should return
  `{ ok: false, failures: ["verify is intentionally heuristic; manual review required"] }`
  rather than silently passing.

## Recovery from failure

The script never mutates `~/Work/Pi-Agent/oh-pi`. Worst case is the
staging clone (`$TMPDIR/oh-pi-staged-upgrade/<hash>-<stamp>`) is in an
inconsistent state — `rm -rf` it.

### A spec failed; how do I diagnose?

```bash
# Look at the staging tree's current state
STAGING="$(ls -dt $TMPDIR/oh-pi-staged-upgrade/* | head -1)"
cd "$STAGING"
git log --oneline | head -20         # what cherry-picks succeeded
git status                            # is there a half-applied cherry-pick?
cat .fork-patches-apply.log           # the human-readable run log

# Reproduce a single failing spec
cd ~/Work/Pi-Agent/oh-pi
npx tsx .fork-patches/cli.ts --apply --spec <id> --repo "$STAGING" --verbose

# Manually cherry-pick to see the conflict
cd "$STAGING"
git cherry-pick <referenceCommit>
# fix conflicts in editor, then:
git cherry-pick --continue
```

### A spec is stale (upstream subsumed it)

If `--check` reports `already` for a spec against fresh upstream/main
without any cherry-pick happening, upstream now ships the behavior
natively. Remove the spec from `.fork-patches/specs/`, document in
`INVENTORY.md` under "Commits explicitly dropped during reconciliation".

### Force a single-spec run

```bash
npx tsx .fork-patches/cli.ts --apply --spec <id> --repo <staging-or-clone>
```

## How this differs from pi-less-shitty's patch-applier

pi-less-shitty patches the **installed dist** of pi (built JS files in
`/opt/homebrew/lib/...`). Each upgrade replaces the dist entirely, so
the patcher's only viable mechanism is AI text-edit re-derivation.

oh-pi patches a **source tree we control**, with full git history. The
natural primitive is `git cherry-pick`. AI fallback is the conflict
escape hatch, not the primary mechanism. The reference commits live on
`feat/all-local` and are never garbage-collected.

## Constraints

- **Never `--force-with-lease` from inside the script.** The script
  prints the recommended push command; the human runs it.
- **Live worktree at `~/Work/Pi-Agent/oh-pi` is never touched.** pi loads
  `packages/subagents` from there at session start; mutating it mid-run
  would break the very tool we're using.
- **AI re-derivation requires a working `pi` binary on PATH.** If `pi`
  is broken (the live install has an issue), AI fallback can't run and
  conflicts must be resolved manually.

## Open questions

1. **Should `oh-pi-staged-upgrade.sh` auto-fast-forward feat/all-local
   when verify is clean and tests pass?** Currently it always stops and
   asks the human. Pros: safer. Cons: more friction for routine syncs.

2. **The vitest smoke step is fragile** (workspace deps need full
   `pnpm install` in staging). Consider running tests only against
   `packages/subagents` in an isolated workspace, not the full repo.

3. **AI fallback is single-file only.** Multi-file conflicts require
   human resolution. Investigate whether a multi-file fallback (one
   subagent per file in parallel, then a coherence-check pass) would be
   worth the complexity.
