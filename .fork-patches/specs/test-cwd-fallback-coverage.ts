/**
 * test-cwd-fallback-coverage
 *
 * Test-only addition: cover the cwd fallback paths in async-execution.test.ts
 * (single-agent + chain, with/without explicit cwd). Aligned with the
 * `skills-resolved-against-task-cwd` patch.
 *
 * Reference commit: 864df67 (post-reconciliation; cherry-picked from 4fffedd)
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "test-cwd-fallback-coverage",
	targets: ["packages/subagents/tests/async-execution.test.ts"],
	referenceCommit: "864df678f50e7e6e129b0370c238518748ca7bc7",

	intent:
		"packages/subagents/tests/async-execution.test.ts MUST contain test cases that exercise the cwd fallback chain in async execution: single-agent with task cwd, single-agent without task cwd (falls back to ctx.cwd), chain with per-step cwd, chain without per-step cwd (falls back to chain-level cwd, then to ctx.cwd). These tests assert that `resolveSkillsAsync` is called with the correct cwd argument for each case.",

	verify(readTarget) {
		const content = readTarget("packages/subagents/tests/async-execution.test.ts");
		const failures: string[] = [];
		const patterns = [
			/resolves async single-agent skills against task cwd/,
			/resolves async chain step skills against step cwd/,
			/resolves async single-agent skills against context cwd/,
			/resolves async chain step skills against context cwd/,
		];
		for (const p of patterns) {
			if (!p.test(content)) {
				failures.push(`async-execution.test.ts: missing test "${p.source}"`);
			}
		}
		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
