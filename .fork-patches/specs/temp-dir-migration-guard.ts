/**
 * temp-dir-migration-guard
 *
 * migrateLegacyProjectAgents() (shared mode) walks parentDirs(cwd) and can
 * migrate legacy repo-local project agents into shared storage. When cwd is a
 * temp directory (os.tmpdir(), e.g. test fixtures under /var/folders/...),
 * this pollutes the user's real shared agent store during tests. Guard the
 * migration with isTempDirectory(cwd) so temp paths are skipped. A test-only
 * env bypass (__PI_SUBAGENT_BYPASS_TEMP_CHECK) lets the migration test itself
 * exercise the migration path from a temp fixture.
 *
 * Reference commit: 34c7716
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "temp-dir-migration-guard",
	targets: [
		"packages/subagents/project-agents-storage.ts",
		"packages/subagents/tests/agents.test.ts",
	],
	referenceCommit: "34c7716",

	intent:
		"project-agents-storage.ts MUST define isTempDirectory(dir) that returns true when dir resolves under os.tmpdir() (resolved.startsWith(tmpdir + sep) || resolved === tmpdir), and false when the env var __PI_SUBAGENT_BYPASS_TEMP_CHECK is set. migrateLegacyProjectAgents() MUST return early when isTempDirectory(cwd) is true, placed AFTER the shared-mode check and BEFORE the parentDirs(cwd) loop. The migration test sets __PI_SUBAGENT_BYPASS_TEMP_CHECK=1 so it can still exercise migration from a temp fixture.",

	verify(readTarget) {
		const failures: string[] = [];
		let src = "";
		try {
			src = readTarget("packages/subagents/project-agents-storage.ts");
		} catch {
			return { ok: false, failures: ["temp-dir-migration-guard: project-agents-storage.ts not found"] };
		}

		if (!/function isTempDirectory\s*\(/.test(src)) {
			failures.push("temp-dir-migration-guard: isTempDirectory() not defined in project-agents-storage.ts");
		}
		if (!/os\.tmpdir\(\)/.test(src)) {
			failures.push("temp-dir-migration-guard: isTempDirectory() must compare against os.tmpdir()");
		}
		if (!/__PI_SUBAGENT_BYPASS_TEMP_CHECK/.test(src)) {
			failures.push("temp-dir-migration-guard: missing __PI_SUBAGENT_BYPASS_TEMP_CHECK env bypass");
		}
		// The guard must actually be wired into the migration entrypoint.
		if (!/if\s*\(\s*isTempDirectory\(\s*cwd\s*\)\s*\)/.test(src)) {
			failures.push(
				"temp-dir-migration-guard: migrateLegacyProjectAgents() does not short-circuit on isTempDirectory(cwd)",
			);
		}

		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
