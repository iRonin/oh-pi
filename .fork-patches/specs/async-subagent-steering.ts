/**
 * async-subagent-steering
 *
 * Async subagents can receive steering messages mid-run via a file-based
 * mailbox. The runtime monitor watches the mailbox path; when the user
 * appends a follow-up, the next poll cycle delivers it to the running
 * subagent.
 *
 * Largest patch in this set — multiple files touched.
 *
 * Reference commit: 61d0e8a (post-reconciliation; cherry-picked from da03947)
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "async-subagent-steering",
	targets: [
		"packages/subagents/async-execution.ts",
		"packages/subagents/runtime-monitor.ts",
		"packages/subagents/subagent-runner.ts",
		"packages/subagents/index.ts",
	],
	referenceCommit: "61d0e8a9662d6b39d44f04db6fe229e9c7bb8840",

	intent:
		"Async subagents MUST support file-based steering: a mailbox file path is allocated per run, the runtime monitor watches/polls that file, and the spawned subagent reads new entries on each poll cycle. The mailbox path MUST be passed to subagent-runner.ts via env or the resolved config payload. The user-facing follow-up mechanism (a /steer command or equivalent in async widget) MUST write to the mailbox path.",

	verify(readTarget) {
		const failures: string[] = [];
		const files = [
			"packages/subagents/async-execution.ts",
			"packages/subagents/runtime-monitor.ts",
			"packages/subagents/subagent-runner.ts",
		];
		let foundMailbox = false;
		for (const f of files) {
			let c = "";
			try {
				c = readTarget(f);
			} catch {
				continue;
			}
			if (/mailbox|steer|follow[-_]?up/i.test(c)) {
				foundMailbox = true;
				break;
			}
		}
		if (!foundMailbox) {
			failures.push(
				"async-subagent-steering: no reference to mailbox / steer / follow-up in async runner, monitor, or runner — steering feature appears absent",
			);
		}
		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
