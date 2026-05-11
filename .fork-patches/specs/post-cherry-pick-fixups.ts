/**
 * post-cherry-pick-fixups
 *
 * Test-only fixups that align the cherry-picked source patches with current
 * upstream/main API renames:
 *
 *  - async-execution.test.ts: assert against `resolveSkillsAsync` (current
 *    upstream name) instead of the legacy `resolveSkills` mock; await two
 *    chain-execution tests so assertions run after the chain loop has
 *    actually progressed past the first step.
 *  - execution.test.ts: remove a duplicate "resolves skills against task
 *    cwd" test left over from local commit 17072da. Upstream's version
 *    is the better-mocked one (uses vi.waitFor).
 *
 * No production-code change.
 *
 * Reference commit: 4373fa2 (this is itself a fixup; cherry-pick will be a
 * no-op once the underlying renames are absorbed upstream).
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "post-cherry-pick-fixups",
	targets: [
		"packages/subagents/tests/async-execution.test.ts",
		"packages/subagents/tests/execution.test.ts",
	],
	referenceCommit: "4373fa2078c0ac2ea1552e310340e2ee405cc006",

	intent:
		"In packages/subagents/tests/async-execution.test.ts, all assertions on the async resolveSkills mock MUST use `asyncMocks.resolveSkillsAsync` (current upstream export name), not the legacy `asyncMocks.resolveSkills`. " +
		"In packages/subagents/tests/execution.test.ts, there MUST NOT be two distinct `it(...)` blocks named exactly \"resolves skills against task cwd, not runtime cwd\" — the duplicate from local cherry-pick must be removed in favour of upstream's better-mocked version.",

	verify(readTarget) {
		const failures: string[] = [];

		// 1. async-execution.test.ts — must not assert against legacy mock name
		const asyncTest = readTarget("packages/subagents/tests/async-execution.test.ts");
		// asyncMocks.resolveSkills(...) as a method call/assertion (NOT resolveSkillsAsync)
		const legacyCallRe = /asyncMocks\.resolveSkills(?!Async)\b/;
		if (legacyCallRe.test(asyncTest)) {
			failures.push(
				"async-execution.test.ts: still references legacy asyncMocks.resolveSkills (not resolveSkillsAsync) — upstream renamed the export",
			);
		}
		if (!/asyncMocks\.resolveSkillsAsync/.test(asyncTest)) {
			failures.push("async-execution.test.ts: no asyncMocks.resolveSkillsAsync references at all — suspicious");
		}

		// 2. execution.test.ts — must not have duplicate test title
		const syncTest = readTarget("packages/subagents/tests/execution.test.ts");
		const dupRe = /resolves skills against task cwd, not runtime cwd/g;
		const matches = syncTest.match(dupRe) ?? [];
		if (matches.length > 1) {
			failures.push(
				`execution.test.ts: duplicate test title "resolves skills against task cwd, not runtime cwd" appears ${matches.length} times — must be deduplicated`,
			);
		}

		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
