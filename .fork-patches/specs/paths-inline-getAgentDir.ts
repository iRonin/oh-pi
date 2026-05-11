/**
 * paths-inline-getAgentDir
 *
 * Replace the runtime import of `getAgentDir` from `@earendil-works/pi-coding-agent`
 * (or `@mariozechner/pi-coding-agent` pre-0.74.0) in packages/subagents/paths.ts
 * with an inline reimplementation, so the async runner can be spawned as a
 * detached child without ERR_MODULE_NOT_FOUND or ERR_PACKAGE_PATH_NOT_EXPORTED.
 *
 * Why this is needed (reproducible failure mode):
 *   - paths.ts is imported by subagent-runner.ts, which is spawned by
 *     async-execution.ts as a fresh detached node process.
 *   - The detached child has no path to the globally-installed pi package
 *     (`/opt/homebrew/lib/node_modules/<scope>/pi-coding-agent`).
 *   - Even when NODE_PATH is set, pi v0.74.0+ ships ESM-only exports; jiti's
 *     CJS resolver can't satisfy the bare-specifier import.
 *   - Net effect: every async subagent dispatch crashed *before* writing
 *     status.json. Jobs displayed as "running" forever, leaking zombie dirs
 *     under $TMPDIR/pi-async-subagent-runs/.
 *
 * The fix inlines pi's trivial getAgentDir() so paths.ts has no runtime
 * dependency on `@earendil-works/pi-coding-agent`:
 *
 *     export function resolveAgentDir(): string {
 *       const envDir = process.env.PI_CODING_AGENT_DIR;
 *       if (envDir) return expandTilde(envDir);
 *       return path.join(os.homedir(), ".pi", "agent");
 *     }
 *
 * Behavioural equivalence to pi's `getAgentDir` is critical: same env var
 * (`PI_CODING_AGENT_DIR`), same default (`~/.pi/agent`), same tilde
 * expansion. If pi ever changes those semantics this verify will continue
 * to pass, so the spec must be revisited on major pi version bumps.
 *
 * Reference commit: 37abe4b — fix(subagents): inline getAgentDir to unbreak
 * async runner on pi v0.74.0+
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "paths-inline-getAgentDir",
	targets: ["packages/subagents/paths.ts"],
	referenceCommit: "37abe4bc455c11b5c95fae90a597e01d0bb75026",

	intent:
		"In packages/subagents/paths.ts, the resolveAgentDir() function MUST NOT depend on a bare-specifier import of getAgentDir from @earendil-works/pi-coding-agent (or @mariozechner/pi-coding-agent — either scope). That import is unresolvable when paths.ts is loaded inside a detached child process spawned by the async subagent runner. " +
		"Instead, resolveAgentDir() must compute the agent directory inline using node:os and node:path: " +
		"(1) if process.env.PI_CODING_AGENT_DIR is set, expand any leading '~' / '~/' against os.homedir() and return that path; " +
		"(2) otherwise return path.join(os.homedir(), '.pi', 'agent'). " +
		"The behaviour MUST match pi's own getAgentDir() exactly: same env var name, same default suffix '.pi/agent', same tilde expansion semantics. " +
		"Only paths.ts is in scope for this patch — other files in packages/subagents/ may continue to import pi as type-only.",

	hint: `Before (upstream/main shape):

    import { getAgentDir } from "@earendil-works/pi-coding-agent";  // or @mariozechner/...
    import path from "node:path";

    export function resolveAgentDir(): string {
        return getAgentDir();
    }

After (target shape — exact comments/whitespace can vary, only behavior is verified):

    import path from "node:path";
    import os from "node:os";

    function expandTilde(p: string): string {
        if (p === "~") return os.homedir();
        if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
        return p;
    }

    export function resolveAgentDir(): string {
        const envDir = process.env.PI_CODING_AGENT_DIR;
        if (envDir) return expandTilde(envDir);
        return path.join(os.homedir(), ".pi", "agent");
    }

Notes for the applier:
- Do NOT touch any other function in this file. getSubagentConfigPath, getUserAgentsDir,
  getSessionsBaseDir, getRunHistoryPath etc. must remain byte-identical aside from
  any whitespace shifts caused by the import block change.
- Do NOT delete type-only imports if upstream uses them — only the runtime value
  import of getAgentDir must go.
- If upstream renames the import or moves getAgentDir to a sub-path
  (e.g. @earendil-works/pi-coding-agent/config), the verify guard below will still
  flag it because it bans any runtime import naming getAgentDir.`,

	verify(readTarget) {
		const content = readTarget("packages/subagents/paths.ts");
		const failures: string[] = [];

		// 1. No runtime import of getAgentDir from the pi-coding-agent package
		//    under either scope. `import type { ... } from "..."` is allowed
		//    because tsx/jiti erases type imports before execution.
		const runtimeImportRegex =
			/^\s*import\s+(?!type\b)[^;]*?\bgetAgentDir\b[^;]*?from\s+["']@(?:earendil-works|mariozechner)\/pi-coding-agent["']/m;
		if (runtimeImportRegex.test(content)) {
			failures.push(
				"paths.ts still imports getAgentDir at runtime from @earendil-works/pi-coding-agent or @mariozechner/pi-coding-agent — detached child spawn will crash with ERR_MODULE_NOT_FOUND",
			);
		}

		// 2. resolveAgentDir must exist as an exported function.
		if (!/export\s+function\s+resolveAgentDir\s*\(/.test(content)) {
			failures.push("exported function resolveAgentDir() not found");
		}

		// 3. The implementation must reference both PI_CODING_AGENT_DIR (env
		//    var contract) and a `.pi/agent` join (default contract). These
		//    are behavioral fingerprints; whitespace/comment changes won't
		//    affect them.
		if (!/PI_CODING_AGENT_DIR/.test(content)) {
			failures.push(
				"PI_CODING_AGENT_DIR env var lookup missing — inlined getAgentDir is not honouring pi's env contract",
			);
		}
		if (!/["'`]\.pi["'`]\s*,\s*["'`]agent["'`]/.test(content) && !/["'`]\.pi\/agent["'`]/.test(content)) {
			failures.push(
				"default '.pi/agent' suffix not visible — inlined getAgentDir likely diverged from pi's default",
			);
		}

		// 4. Tilde expansion must be present (either an explicit helper or an
		//    inline check). We don't pin the function name — just that a `~`
		//    check is wired up.
		if (!/['"`]~['"`]|startsWith\(\s*["'`]~/.test(content)) {
			failures.push(
				"no tilde ('~') expansion logic found — env var PI_CODING_AGENT_DIR=~/foo will be returned unexpanded",
			);
		}

		// 5. os.homedir must be called (either directly or via destructured
		//    import). Without it the default cannot work.
		if (!/\bhomedir\s*\(/.test(content)) {
			failures.push(
				"os.homedir() not called — paths.ts cannot compute the default '~/.pi/agent' location",
			);
		}

		// 6. Regression guard: the historical buggy version of this file
		//    returned the raw env var without tilde expansion. If a
		//    `return process.env.PI_CODING_AGENT_DIR` pattern appears
		//    without an intervening expansion call, fail loudly.
		if (
			/return\s+process\.env\.PI_CODING_AGENT_DIR\s*;/.test(content) &&
			!/expand(?:Tilde|TildePath)\s*\(\s*(?:envDir|process\.env\.PI_CODING_AGENT_DIR)/.test(content)
		) {
			failures.push(
				"PI_CODING_AGENT_DIR returned without tilde expansion — regression of pre-37abe4b behavior",
			);
		}

		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
