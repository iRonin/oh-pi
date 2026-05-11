/**
 * ForkPatchSpec — durable description of a single fork customization.
 *
 * Adapted from pi-less-shitty/packages/patch-applier/src/types.ts. Differences:
 *  - target → targets[]: source patches frequently touch multiple files (tests
 *    + source + types)
 *  - referenceCommit: the canonical commit on the fork that demonstrates the
 *    patch. Used by sync-from-upstream.sh as the cherry-pick source on each
 *    upstream sync. AI re-derivation only kicks in when cherry-pick conflicts
 *    or verify fails afterwards.
 *  - verify receives a readTarget() function instead of a single string,
 *    because a single spec may need to check several files (e.g. types.ts
 *    schema change + runtime use of that type).
 */

export interface ForkPatchSpec {
	id: string;
	targets: string[];
	intent: string;
	hint?: string;
	referenceCommit: string;
	verify: (readTarget: (path: string) => string) => VerifyResult;
}

export type VerifyResult = { ok: true } | { ok: false; failures: string[] };
