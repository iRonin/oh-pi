/**
 * configurable-parallel-limits
 *
 * Replaces hardcoded MAX_PARALLEL / MAX_CONCURRENCY with a
 * `resolveSubagentLimits(cwd)` helper that reads from env vars
 * (PI_SUBAGENT_MAX_PARALLEL / PI_SUBAGENT_MAX_CONCURRENCY),
 * project `.pi/settings.json`, user settings, and finally defaults
 * (DEFAULT_MAX_PARALLEL=8, DEFAULT_MAX_CONCURRENCY=4). Safety-capped at
 * 32 / 16 to prevent typos from spawning hundreds of processes.
 *
 * Reference commit: d853301 (post-reconciliation; cherry-picked from d1ea615)
 *
 * NOTE: the actual implementation lives in `packages/subagents/types.ts`, not
 * `settings.ts`. The patch defines DEFAULT_MAX_PARALLEL/DEFAULT_MAX_CONCURRENCY,
 * SubagentLimits, and resolveSubagentLimits there and exports them alongside
 * backward-compatible aliases.
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "configurable-parallel-limits",
	targets: ["packages/subagents/types.ts"],
	referenceCommit: "d853301fad05cf336e61e748882f706640518d5d",

	intent:
		"packages/subagents/types.ts MUST export a `resolveSubagentLimits(cwd: string)` helper plus DEFAULT_MAX_PARALLEL and DEFAULT_MAX_CONCURRENCY constants. The helper MUST read PI_SUBAGENT_MAX_PARALLEL / PI_SUBAGENT_MAX_CONCURRENCY env vars first, then walk to `.pi/settings.json` at the given cwd, then fall back to user settings at `~/.pi/agent/settings.json`, then the defaults. The returned SubagentLimits object MUST have numeric `maxParallel` and `maxConcurrency` fields capped at 32 and 16 respectively.",

	verify(readTarget) {
		const failures: string[] = [];
		const types = readTarget("packages/subagents/types.ts");

		if (!/\bresolveSubagentLimits\s*\(/.test(types)) {
			failures.push("types.ts: resolveSubagentLimits() not defined");
		}
		if (!/\bDEFAULT_MAX_PARALLEL\b/.test(types)) {
			failures.push("types.ts: DEFAULT_MAX_PARALLEL constant missing");
		}
		if (!/\bDEFAULT_MAX_CONCURRENCY\b/.test(types)) {
			failures.push("types.ts: DEFAULT_MAX_CONCURRENCY constant missing");
		}
		if (!/\bmaxParallel\b/.test(types) || !/\bmaxConcurrency\b/.test(types)) {
			failures.push("types.ts: SubagentLimits.maxParallel / maxConcurrency fields missing");
		}
		if (!/PI_SUBAGENT_MAX_PARALLEL/.test(types)) {
			failures.push("types.ts: env var PI_SUBAGENT_MAX_PARALLEL not honoured");
		}

		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
