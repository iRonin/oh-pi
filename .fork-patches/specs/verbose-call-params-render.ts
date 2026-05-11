/**
 * verbose-call-params-render
 *
 * Subagent results include a `buildCallDetailBlock` rendering of the call
 * params (agent, task, model, skills) for human-readable inspection in TUI
 * results.
 *
 * Reference commit: 45e1850 (post-reconciliation; cherry-picked from 205add5)
 *
 * NOTE: upstream PR #300 also added a similar helper. The verify is loose —
 * it just checks the function exists.
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "verbose-call-params-render",
	targets: ["packages/subagents/index.ts"],
	referenceCommit: "45e185030d6b84b38229f8b96cc71276b0c5e5c1",

	intent:
		"packages/subagents/index.ts MUST export or define a `buildCallDetailBlock(params)` function that renders subagent call params as a human-readable string, and the dispatch path MUST invoke it when building result content.",

	verify(readTarget) {
		const content = readTarget("packages/subagents/index.ts");
		const failures: string[] = [];
		if (!/function\s+buildCallDetailBlock\s*\(/.test(content)) {
			failures.push("packages/subagents/index.ts: buildCallDetailBlock function not defined");
		}
		if (!/buildCallDetailBlock\s*\(/.test(content.replace(/function\s+buildCallDetailBlock/, ""))) {
			failures.push("packages/subagents/index.ts: buildCallDetailBlock defined but never called");
		}
		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
