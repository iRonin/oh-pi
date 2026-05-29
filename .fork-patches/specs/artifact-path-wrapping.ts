/**
 * artifact-path-wrapping
 *
 * Subagent artifact paths (especially long Dropbox/iCloud paths) were
 * hard-truncated by truncLine() in the TUI result view, making it
 * impossible to see the full path. Switch to wrapTextWithAnsi() so
 * the path wraps across multiple lines instead of being cut off.
 *
 * Reference commit: d8651fb
 */

import type { ForkPatchSpec } from "../types.js";

export const spec: ForkPatchSpec = {
	id: "artifact-path-wrapping",
	targets: [
		"packages/subagents/render.ts",
	],
	referenceCommit: "d8651fb",

	intent:
		"In render.ts renderSubagentResult(), BOTH artifact path lines (single-result 'Artifacts:' and multi-step 'Artifacts dir:') MUST use wrapTextWithAnsi() instead of truncLine() so long paths wrap rather than being cut off with ellipsis. wrapTextWithAnsi is already imported from @earendil-works/pi-tui. The label text is built as a variable, then wrapped, then passed to new Text(wrapped.join('\\n')).",

	verify(readTarget) {
		const failures: string[] = [];
		let c = "";
		try {
			c = readTarget("packages/subagents/render.ts");
		} catch {
			return { ok: false, failures: ["artifact-path-wrapping: render.ts not found"] };
		}

		// Check that artifact paths use wrapTextWithAnsi instead of truncLine
		const artifactWrapping = /wrapTextWithAnsi.*artifactLabel/s;
		if (!artifactWrapping.test(c)) {
			failures.push(
				"artifact-path-wrapping: render.ts does not use wrapTextWithAnsi for artifact paths — paths will be truncated on long terminal lines",
			);
		}

		// Verify both single-result and multi-step paths are wrapped
		const singleArtifact = /Artifacts:.*artifactPaths\.outputPath/;
		const multiArtifact = /Artifacts dir:.*artifacts\.dir/;
		if (singleArtifact.test(c) && multiArtifact.test(c)) {
			// Both artifact lines exist — check they're NOT wrapped in truncLine
			const truncLineArtifacts = /truncLine.*Artifacts.*artifactPaths|truncLine.*Artifacts.*artifacts\.dir/;
			if (truncLineArtifacts.test(c)) {
				failures.push(
					"artifact-path-wrapping: at least one artifact path line still uses truncLine instead of wrapTextWithAnsi",
				);
			}
		}

		return failures.length === 0 ? { ok: true } : { ok: false, failures };
	},
};
