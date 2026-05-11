/**
 * exclude-builtins-config
 *
 * `subagents.excludeBuiltins: true` flag in `.pi/settings.json` disables the
 * built-in subagent set (e.g. scout, planner, reviewer), so a project can
 * limit available agents to its own `.pi/agents/*.md` definitions.
 *
 * Reference commit: 44fd95a (post-reconciliation; cherry-picked from 417f103)
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "exclude-builtins-config",
	targets: ["packages/subagents/agents.ts"],
	referenceCommit: "44fd95ad17a380ff57aa30a26a2b575eea47081f",

	intent:
		"packages/subagents/agents.ts MUST honour a `subagents.excludeBuiltins` boolean from `.pi/settings.json`. When true, the agent discovery code path must NOT register built-in agents — only project agents from `.pi/agents/` and explicit user-defined agents. When false or unset, behaviour is unchanged.",

	verify(readTarget) {
		const content = readTarget("packages/subagents/agents.ts");
		const failures: string[] = [];
		if (!/excludeBuiltins/.test(content)) {
			failures.push("packages/subagents/agents.ts: no reference to excludeBuiltins config flag");
		}
		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
