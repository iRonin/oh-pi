---
"@ifi/oh-pi": patch
---

Fix npm install failing to load extensions, themes, prompts, and skills.

Replace `"bundleDependencies": false` with a proper `"bundledDependencies"` array so sub-packages
are embedded in the tarball. Without this, npm hoists the `@ifi/*` dependencies to the parent
`node_modules/`, causing every `node_modules/@ifi/...` path in the `pi` field to resolve to nothing.

Add `packages/oh-pi/.npmrc` with `node-linker=hoisted` so pnpm can pack bundled dependencies
(pnpm's default isolated linker does not support `bundledDependencies`).
