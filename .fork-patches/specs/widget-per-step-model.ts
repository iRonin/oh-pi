/**
 * widget-per-step-model
 *
 * Async widget displays the resolved model per chain step / per agent in the
 * pending/running widget. Previously only the top-level model was shown.
 *
 * Reference commit: 036d7fa (post-reconciliation; cherry-picked from 1ee7be8)
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "widget-per-step-model",
	targets: [
		"packages/subagents/render.ts",
		"packages/subagents/runtime-monitor.ts",
		"packages/subagents/subagent-runner.ts",
		"packages/subagents/types.ts",
	],
	referenceCommit: "036d7facfcb6d8540cf10f74723b7d717d29000b",

	intent:
		"The async runner widget (rendered by render.ts based on state in runtime-monitor.ts) MUST display the resolved model for each individual agent/step, not just the top-level model. " +
		"Specifically: when the AsyncJobState carries a per-step model list (e.g. via a `models?: string[]` or `stepModels?: string[]` field on the state object), render.ts MUST emit that model alongside each agent name in the widget output, typically as `agent-name [model-id]`. " +
		"When the per-step list is absent or empty, the widget falls back to the single top-level model (existing behaviour).",

	verify(readTarget) {
		const failures: string[] = [];
		const types = readTarget("packages/subagents/types.ts");
		const render = readTarget("packages/subagents/render.ts");

		// types.ts should declare a per-step / per-agent model carrier on the
		// async state. We don't pin the exact name; both `models` and
		// `stepModels` are acceptable.
		if (!/\b(?:models|stepModels|agentModels|stepModel)\s*\?\s*:/.test(types)) {
			failures.push(
				"packages/subagents/types.ts: no optional per-step model field (models?: / stepModels?: / agentModels?:) found on the async job state type",
			);
		}

		// render.ts should reference that field when building agent labels.
		if (!/\b(?:models|stepModels|agentModels|stepModel)\b/.test(render)) {
			failures.push(
				"packages/subagents/render.ts: no reference to a per-step model field — widget cannot annotate each agent with its resolved model",
			);
		}

		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
