/**
 * custom-tool-name-resolution
 *
 * The subagent runner translates short custom tool names (e.g. `read_full`)
 * to their extension paths before passing to the spawned pi CLI. Without
 * this, pi would fail to resolve the named tool inside the detached child.
 *
 * Reference commit: 5df7b51 (post-reconciliation; cherry-picked from 8a27c94)
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "custom-tool-name-resolution",
	targets: ["packages/subagents/subagent-runner.ts"],
	referenceCommit: "5df7b518ae25cb101cd69bcb878c0274521754f3",

	intent:
		"packages/subagents/subagent-runner.ts MUST contain a KNOWN_CUSTOM_TOOLS table that maps short tool names to extension paths, and the runner MUST translate any tool name found in this table to its extension path before invoking pi.",

	verify(readTarget) {
		const content = readTarget("packages/subagents/subagent-runner.ts");
		const failures: string[] = [];
		if (!/KNOWN_CUSTOM_TOOLS/.test(content)) {
			failures.push("subagent-runner.ts: KNOWN_CUSTOM_TOOLS table not present");
		}
		if (!/read_full/.test(content)) {
			failures.push("subagent-runner.ts: read_full custom tool not mapped");
		}
		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
