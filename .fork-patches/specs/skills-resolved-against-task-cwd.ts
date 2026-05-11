/**
 * skills-resolved-against-task-cwd
 *
 * Skills referenced by a subagent task are resolved against the TASK'S cwd,
 * not the runtime cwd of the parent pi process. Critical when the parent is
 * launched in one directory but dispatches subagents in legal-project /
 * separate workspaces.
 *
 * Reference commit: 19cfd2f (post-reconciliation; cherry-picked from 17072da)
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "skills-resolved-against-task-cwd",
	targets: ["packages/subagents/execution.ts", "packages/subagents/async-execution.ts"],
	referenceCommit: "19cfd2fef15c21fd5b8d9da187e3f8c89cd3cbda",

	intent:
		"In both execution.ts (sync) and async-execution.ts (async + chain), skill resolution MUST use the task's cwd (or chain step's cwd, then chain-level cwd) before falling back to the parent ctx.cwd. The argument passed to resolveSkillsAsync MUST be `cwd ?? ctx.cwd` or equivalent — never the parent runtime cwd alone.",

	verify(readTarget) {
		const failures: string[] = [];
		const sync = readTarget("packages/subagents/execution.ts");
		const asyncExec = readTarget("packages/subagents/async-execution.ts");

		// sync path: resolveSkillsAsync(..., cwd ?? runtimeCwd) or similar
		if (!/resolveSkillsAsync\([^)]*cwd\s*\?\?/.test(sync) && !/resolveSkills\w*\([^)]*cwd\s*\?\?/.test(sync)) {
			failures.push(
				"execution.ts: skill resolution doesn't appear to prefer task cwd (no `cwd ??` fallback in resolveSkills call)",
			);
		}
		// async path: per-step cwd fallback
		if (!/resolveSkillsAsync\([^)]*\bcwd\b/.test(asyncExec)) {
			failures.push("async-execution.ts: resolveSkillsAsync not invoked with cwd fallback");
		}

		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
