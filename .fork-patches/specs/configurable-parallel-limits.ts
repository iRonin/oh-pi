/**
 * configurable-parallel-limits
 *
 * Reads `subagents.maxParallel` / `subagents.maxConcurrency` from
 * `.pi/settings.json` via a `resolveSubagentLimits(cwd)` helper. Allows a
 * project to override the default parallel-dispatch and per-call concurrency
 * caps for the subagent tool.
 *
 * Reference commit: d853301 (post-reconciliation; cherry-picked from d1ea615)
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "configurable-parallel-limits",
	targets: ["packages/subagents/settings.ts", "packages/subagents/index.ts"],
	referenceCommit: "d853301fad05cf336e61e748882f706640518d5d",

	intent:
		"A `resolveSubagentLimits(cwd: string)` helper MUST exist and read `subagents.maxParallel` and `subagents.maxConcurrency` from `.pi/settings.json` at the given cwd, falling back to project defaults. The subagent tool dispatch path MUST consult these limits before enforcing parallel/concurrency caps.",

	verify(readTarget) {
		const failures: string[] = [];
		const settings = readTarget("packages/subagents/settings.ts");
		const index = readTarget("packages/subagents/index.ts");

		if (!/resolveSubagentLimits|maxParallel|maxConcurrency/.test(settings)) {
			failures.push(
				"packages/subagents/settings.ts: missing resolveSubagentLimits / maxParallel / maxConcurrency support",
			);
		}
		if (!/resolveSubagentLimits|maxParallel|maxConcurrency/.test(index)) {
			failures.push(
				"packages/subagents/index.ts: dispatch path does not consult configurable subagent limits",
			);
		}

		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
