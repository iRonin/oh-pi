/**
 * cascading-skill-discovery-clarify
 *
 * `buildSkillPaths` walks ancestor directories from the agent file's location
 * (not just the runtime cwd) when assembling skill search paths for the
 * clarify TUI. Allows skills to be picked up from `.pi/skills/` directories
 * above the agent file.
 *
 * Reference commit: ee9a745 (post-reconciliation; cherry-picked from 60bc44d)
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "cascading-skill-discovery-clarify",
	targets: ["packages/subagents/skills.ts"],
	referenceCommit: "ee9a7450bafd312ab15e2608950e066694fb7585",

	intent:
		"packages/subagents/skills.ts MUST provide a buildSkillPaths-style helper that walks ancestor directories of an agent's filepath when assembling skill search paths. This is what the clarify TUI relies on to scan ancestor `.pi/skills/` directories.",

	verify(readTarget) {
		const content = readTarget("packages/subagents/skills.ts");
		const failures: string[] = [];
		if (!/buildSkillPaths|ancestorDirs|walkAncestors|parentDirs/i.test(content)) {
			failures.push(
				"skills.ts: no ancestor-walking helper visible (looked for buildSkillPaths/ancestorDirs/walkAncestors/parentDirs)",
			);
		}
		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
