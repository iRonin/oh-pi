---
default: minor
---

Add `@ifi/pi-spec`, a native spec-driven workflow package for pi built as raw TypeScript instead of
shell-script wrappers.

- publish a new `@ifi/pi-spec` package that registers a single `/spec` command with status, init,
  constitution, specify, clarify, checklist, plan, tasks, analyze, implement, list, and next flows
- vendor spec-kit-inspired workflow templates into the package and scaffold them into `.specify/`
  for per-repository customization
- implement native repo detection, feature numbering, branch naming, git branch creation, checklist
  summaries, and prompt handoff entirely in TypeScript
- add comprehensive Vitest coverage for workspace helpers, scaffold creation, prompt generation, and
  command behavior
- integrate the new package into the oh-pi installer, CLI resource copying, extension registry, and
  repo documentation
