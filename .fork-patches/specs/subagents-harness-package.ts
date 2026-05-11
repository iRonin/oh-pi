/**
 * subagents-harness-package
 *
 * Adds the `@ifi/pi-subagents-harness` test package — a multi-agent
 * orchestration test harness that simulates parallel teams, chain execution,
 * failure modes (crash, timeout, rate_limit, skill_not_found, etc.) and
 * context cleanliness without spawning real pi processes.
 *
 * Net-new in this fork — has no equivalent on upstream/main.
 *
 * Reference commit: f652181 (post-reconciliation; cherry-picked from 568073e)
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "subagents-harness-package",
	targets: [
		"packages/subagents-harness/package.json",
		"packages/subagents-harness/tests/harness.test.ts",
		"vitest.config.ts",
	],
	referenceCommit: "f652181696fa1de7cbdc171348052982355d1b26",

	intent:
		"The fork MUST contain a `packages/subagents-harness/` package that defines `@ifi/pi-subagents-harness` with vitest-based orchestration tests covering parallel teams, chain `{previous}` context passing, failure modes (crash/timeout/rate_limit/skill_not_found/empty/partial), recovery testing (retryable vs non-retryable), and context cleanliness. The root `vitest.config.ts` MUST include this package in its discovery.",

	verify(readTarget) {
		const failures: string[] = [];
		try {
			const pkg = readTarget("packages/subagents-harness/package.json");
			if (!/@ifi\/pi-subagents-harness/.test(pkg)) {
				failures.push("subagents-harness/package.json: missing @ifi/pi-subagents-harness name");
			}
		} catch {
			failures.push("subagents-harness/package.json: file missing");
		}
		try {
			const test = readTarget("packages/subagents-harness/tests/harness.test.ts");
			if (test.length < 1000) {
				failures.push("subagents-harness/tests/harness.test.ts: file too short — likely missing scenarios");
			}
		} catch {
			failures.push("subagents-harness/tests/harness.test.ts: file missing");
		}
		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
