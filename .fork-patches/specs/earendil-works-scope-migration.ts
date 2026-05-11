/**
 * earendil-works-scope-migration
 *
 * pi v0.74.0 (May 2026) renamed `@mariozechner/*` packages to `@earendil-works/*`.
 * Our fork's subagents extension must reference the new scope so it loads
 * against the current pi install.
 *
 * Note: this spec becomes a no-op once `ifiokjr/oh-pi` upstream completes the
 * same migration. The verify is idempotent — it asserts no `@mariozechner/*`
 * remains in subagents source, which will keep passing post-upstream-migration.
 *
 * Reference commit: a9881f7 (post-reconciliation; cherry-picked from 8ffbfd2)
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "earendil-works-scope-migration",
	targets: ["packages/subagents/**"],
	referenceCommit: "a9881f75751771627b92adba1d13f9dc4825f60d",

	intent:
		"All TypeScript files under packages/subagents/ MUST import pi types and runtime helpers from `@earendil-works/pi-coding-agent` (and related `@earendil-works/*` scopes), not from `@mariozechner/pi-coding-agent`. " +
		"The package.json peerDependency / devDependency entries for `@mariozechner/pi-coding-agent` (and `@mariozechner/pi-tui`) MUST point at `@earendil-works/pi-coding-agent` (and `@earendil-works/pi-tui`) respectively. " +
		"This is a compile-time-only migration; runtime behavior is unchanged because tsx/jiti erases type imports.",

	verify(readTarget) {
		const failures: string[] = [];
		const files = [
			"packages/subagents/index.ts",
			"packages/subagents/paths.ts",
			"packages/subagents/skills.ts",
			"packages/subagents/execution.ts",
			"packages/subagents/async-execution.ts",
			"packages/subagents/subagent-runner.ts",
			"packages/subagents/agent-management.ts",
			"packages/subagents/agent-manager.ts",
			"packages/subagents/agent-manager-list.ts",
			"packages/subagents/agent-manager-detail.ts",
			"packages/subagents/agent-manager-edit.ts",
			"packages/subagents/agent-manager-parallel.ts",
			"packages/subagents/agent-manager-chain-detail.ts",
			"packages/subagents/package.json",
		];

		for (const file of files) {
			let content = "";
			try {
				content = readTarget(file);
			} catch {
				continue; // file may not exist on current upstream
			}
			if (/@mariozechner\/pi-(?:coding-agent|tui|ai|agent-core)/.test(content)) {
				failures.push(`${file}: still references @mariozechner/pi-* — must be @earendil-works/pi-*`);
			}
		}

		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
