/**
 * read-full-local-path
 *
 * Earlier shape of the `read_full` custom tool resolution: use a local
 * filesystem path instead of an npm specifier. Superseded operationally by
 * `known-custom-tools-absolute-path` (both touch the same map), but kept as
 * a distinct spec to preserve the original commit's authorship and to
 * survive a partial revert of known-custom-tools.
 *
 * Reference commit: d268f3d (post-reconciliation; cherry-picked from dfc4620)
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "read-full-local-path",
	targets: ["packages/subagents/subagent-runner.ts"],
	referenceCommit: "d268f3dda5e0fc71051aad4b226a629114b48919",

	intent:
		"The KNOWN_CUSTOM_TOOLS entry for `read_full` MUST point at a local filesystem path under pi-less-shitty's read-full package, not an npm specifier.",

	verify(readTarget) {
		const content = readTarget("packages/subagents/subagent-runner.ts");
		const failures: string[] = [];
		// Find the read_full mapping (key may be quoted or bare identifier, value
		// may be a string literal OR an expression like path.resolve(...))
		const lineMatch = content.match(/["']?read_full["']?\s*:\s*([^,\n}]+)/);
		if (!lineMatch) {
			failures.push("subagent-runner.ts: no read_full entry in KNOWN_CUSTOM_TOOLS map");
		} else {
			const value = lineMatch[1].trim();
			if (/^["'].*npm:/.test(value)) {
				failures.push(
					`subagent-runner.ts: read_full mapped to npm specifier (${value}) — must be local filesystem path`,
				);
			}
		}
		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
