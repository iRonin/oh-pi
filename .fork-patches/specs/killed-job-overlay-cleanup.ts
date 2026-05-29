/**
 * killed-job-overlay-cleanup
 *
 * A killed async subagent used to stay in the TUI overlay forever, mislabeled
 * as "running". reconcileLiveness() already persists state:"killed" for a
 * vanished worker, but the in-memory job model + widget + cleanup lifecycle
 * didn't handle it:
 *   1. AsyncJobState.status union omitted "killed".
 *   2. renderWidget() mapped any non-complete/failed status to "running".
 *   3. The 10s overlay cleanup fired only on subagent:complete, which a killed
 *      worker (no result file) never emits.
 *
 * Fix: model "killed" on AsyncJobState.status, render it as terminal, and have
 * the runtime monitor signal a shared scheduleJobRemoval() via an onJobTerminal
 * callback when the poller detects the running->killed transition.
 *
 * Reference commit: 0a89edb
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "killed-job-overlay-cleanup",
	targets: [
		"packages/subagents/types.ts",
		"packages/subagents/render.ts",
		"packages/subagents/runtime-monitor.ts",
		"packages/subagents/index.ts",
	],
	referenceCommit: "0a89edb",

	intent:
		"Killed async jobs must leave the overlay instead of sticking as 'running'. " +
		"AsyncJobState.status (types.ts) MUST include \"killed\". renderWidget() (render.ts) MUST map status==='killed' to a terminal label (theme.fg('error','killed')), NOT the default 'running' branch. runtime-monitor.ts RuntimeMonitorOptions MUST expose onJobTerminal(asyncId); the poller MUST skip terminal 'killed' jobs and call options.onJobTerminal(job.asyncId) when it reads status.state==='killed'. index.ts MUST define a shared scheduleJobRemoval() (used by both the subagent:complete handler and onJobTerminal) that removes the job from the overlay after the grace window.",

	verify(readTarget) {
		const failures: string[] = [];
		const read = (p: string): string => {
			try {
				return readTarget(p);
			} catch {
				failures.push(`killed-job-overlay-cleanup: ${p} not found`);
				return "";
			}
		};

		const types = read("packages/subagents/types.ts");
		const render = read("packages/subagents/render.ts");
		const monitor = read("packages/subagents/runtime-monitor.ts");
		const index = read("packages/subagents/index.ts");

		// 1. AsyncJobState.status union must include "killed".
		const jobState = types.match(/interface AsyncJobState\s*\{[\s\S]*?\n\}/);
		if (!jobState || !/status:\s*[^;]*"killed"/.test(jobState[0])) {
			failures.push('killed-job-overlay-cleanup: AsyncJobState.status union does not include "killed"');
		}

		// 2. renderWidget must have a killed branch (not fall through to "running").
		if (!/job\.status === "killed"/.test(render)) {
			failures.push('killed-job-overlay-cleanup: render.ts renderWidget has no job.status === "killed" branch');
		}

		// 3. runtime monitor must expose onJobTerminal and invoke it on killed.
		if (!/onJobTerminal\s*:\s*\(/.test(monitor)) {
			failures.push("killed-job-overlay-cleanup: runtime-monitor.ts RuntimeMonitorOptions lacks onJobTerminal");
		}
		if (!/status\.state === "killed"/.test(monitor) || !/onJobTerminal\(/.test(monitor)) {
			failures.push("killed-job-overlay-cleanup: poller does not call onJobTerminal on a killed transition");
		}
		if (!/=== "killed"/.test(monitor.match(/job\.status === "complete"[\s\S]{0,120}continue/)?.[0] ?? "")) {
			failures.push("killed-job-overlay-cleanup: poller terminal-skip set does not include 'killed'");
		}

		// 4. index.ts must route killed cleanup through a shared scheduleJobRemoval.
		if (!/function scheduleJobRemoval/.test(index) || !/onJobTerminal:\s*scheduleJobRemoval/.test(index)) {
			failures.push("killed-job-overlay-cleanup: index.ts does not wire scheduleJobRemoval as onJobTerminal");
		}

		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
