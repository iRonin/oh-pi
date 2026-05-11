/**
 * known-custom-tools-absolute-path
 *
 * The KNOWN_CUSTOM_TOOLS mapping resolves tool extensions to ABSOLUTE paths
 * via `import.meta.url`-derived URLs at module load time. Without this,
 * spawned subagents inherit the parent's cwd and tool extension paths fail
 * to resolve.
 *
 * Reference commit: 6861a20 (post-reconciliation; cherry-picked from 3887450)
 * Folds in the intent of dfc4620 (use local path for read_full) — both
 * commits work on the same code path; 6861a20 is the corrected shape.
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "known-custom-tools-absolute-path",
	targets: ["packages/subagents/subagent-runner.ts"],
	referenceCommit: "6861a20d705a75f0202ec23abc95125b95a6d31e",

	intent:
		"In packages/subagents/subagent-runner.ts, KNOWN_CUSTOM_TOOLS entries MUST point at absolute filesystem paths derived from `import.meta.url` (or equivalent module-load-time resolution). Relative paths or npm-specifier paths (e.g. `npm:@ironin/read-full`) MUST NOT appear because spawned child processes don't inherit the parent's npm resolution context.",

	verify(readTarget) {
		const content = readTarget("packages/subagents/subagent-runner.ts");
		const failures: string[] = [];

		// Must have absolute-path resolution machinery
		if (!/import\.meta\.url|fileURLToPath/.test(content)) {
			failures.push(
				"subagent-runner.ts: no import.meta.url / fileURLToPath usage — KNOWN_CUSTOM_TOOLS paths may not be absolute",
			);
		}

		// Forbid npm: specifier inside KNOWN_CUSTOM_TOOLS
		const knownBlockMatch = content.match(/KNOWN_CUSTOM_TOOLS[\s\S]*?\}\s*;/);
		if (knownBlockMatch && /npm:/.test(knownBlockMatch[0])) {
			failures.push(
				"subagent-runner.ts: KNOWN_CUSTOM_TOOLS contains npm: specifier — child processes can't resolve those",
			);
		}

		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
