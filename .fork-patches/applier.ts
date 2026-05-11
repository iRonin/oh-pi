/**
 * oh-pi fork-patch applier — cherry-pick first, AI re-derivation on conflict.
 *
 * Different from pi-less-shitty's patch-applier (which patches installed dist
 * files): we work against a **git source tree** we control. The natural
 * primitive is `git cherry-pick <spec.referenceCommit>`. AI re-derivation
 * (delegating to a fresh `pi` subprocess) only kicks in when cherry-pick
 * conflicts OR when verify fails against a clean cherry-pick (meaning
 * upstream silently changed semantics on the same lines).
 *
 * The applier never touches the live worktree of `~/Work/Pi-Agent/oh-pi` —
 * the caller must pass a staging clone path. The live extension at
 * `packages/subagents` is loaded by pi at session_start; mutating it
 * mid-session would break the very tool we're using.
 */

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ForkPatchSpec, VerifyResult } from "./types.js";

export interface ApplyOptions {
	/** Absolute path to the staging git working tree. */
	repoDir: string;
	/** Per-spec AI-dispatch timeout (ms). Default 300_000. */
	timeoutMs?: number;
	/** Override the `pi` binary path (mostly for tests). */
	piBin?: string;
	/** Test hook: replace AI re-derivation. */
	deriveEdits?: (
		spec: ForkPatchSpec,
		fileContent: string,
		filePath: string,
		failures: string[],
	) => Promise<Edit[]>;
	/** Verbose progress to stderr. */
	verbose?: boolean;
}

export interface Edit {
	find: string;
	replace: string;
}

export type ApplyStatus =
	| "applied-cherry-pick"  // clean cherry-pick + verify passed
	| "applied-ai-rederive"  // cherry-pick conflicted or verify failed; AI patched
	| "already"              // verify already passed before any cherry-pick
	| "skipped"              // upstream subsumed this patch (verify passes after no-op cherry-pick)
	| "failed";

export interface ApplyResult {
	specId: string;
	targets: string[];
	status: ApplyStatus;
	commitSha?: string;
	message?: string;
	edits?: Edit[];
}

const DEFAULT_TIMEOUT_MS = Number(process.env.OH_PI_PATCH_TIMEOUT_MS) || 300_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function applyAll(
	specs: ForkPatchSpec[],
	opts: ApplyOptions,
): Promise<ApplyResult[]> {
	const results: ApplyResult[] = [];
	for (const spec of specs) {
		try {
			const r = await applyOne(spec, opts);
			results.push(r);
			if (opts.verbose) {
				const icon = statusIcon(r.status);
				process.stderr.write(`  ${icon} ${spec.id.padEnd(36)} ${r.status}${r.message ? ` — ${r.message}` : ""}\n`);
			}
		} catch (e: any) {
			results.push({
				specId: spec.id,
				targets: spec.targets,
				status: "failed",
				message: `applier crashed: ${e?.message ?? String(e)}`,
			});
		}
	}
	return results;
}

export async function applyOne(spec: ForkPatchSpec, opts: ApplyOptions): Promise<ApplyResult> {
	const readTarget = makeReadTarget(opts.repoDir);

	// Fast path — already satisfied (e.g. upstream subsumed this patch).
	const pre = safeVerify(spec, readTarget);
	if (pre.ok) {
		return { specId: spec.id, targets: spec.targets, status: "already" };
	}

	// Try cherry-pick first.
	const cp = tryCherryPick(opts.repoDir, spec.referenceCommit);
	if (cp.ok) {
		const post = safeVerify(spec, readTarget);
		if (post.ok) {
			return {
				specId: spec.id,
				targets: spec.targets,
				status: "applied-cherry-pick",
				commitSha: cp.sha,
			};
		}
		// Clean cherry-pick but verify fails — upstream changed semantics on
		// the same lines. Revert and fall through to AI re-derivation.
		gitResetHard(opts.repoDir, "HEAD~1");
		// fall through
	} else if (cp.empty) {
		// Cherry-pick produced no changes (upstream already has this patch).
		// Treat as skipped if verify confirms upstream covers our intent.
		const post = safeVerify(spec, readTarget);
		if (post.ok) {
			return {
				specId: spec.id,
				targets: spec.targets,
				status: "skipped",
				message: "upstream appears to subsume this patch (empty cherry-pick + verify ok)",
			};
		}
		// Empty but verify fails — bizarre. Fall through to AI.
	} else {
		// Conflict — abort.
		gitAbortCherryPick(opts.repoDir);
	}

	// AI re-derivation path. Constrained to specs with a single target file
	// (multi-file derivations are too risky for v1).
	if (spec.targets.length !== 1) {
		return {
			specId: spec.id,
			targets: spec.targets,
			status: "failed",
			message:
				`cherry-pick failed and AI re-derivation is only supported for single-target specs ` +
				`(this spec has ${spec.targets.length} targets: ${spec.targets.join(", ")}). ` +
				`Resolve manually then re-run.`,
		};
	}

	const targetPath = spec.targets[0];
	const absPath = path.join(opts.repoDir, targetPath);
	let content: string;
	try {
		content = fs.readFileSync(absPath, "utf8");
	} catch (e: any) {
		return {
			specId: spec.id,
			targets: spec.targets,
			status: "failed",
			message: `cannot read target ${targetPath}: ${e?.message ?? String(e)}`,
		};
	}

	const failures = (spec.verify(readTarget) as { ok: false; failures: string[] }).failures ?? [
		"verify failed (no specific failures returned)",
	];
	const derive = opts.deriveEdits ?? defaultDeriveEdits(opts);
	let edits: Edit[];
	try {
		edits = await derive(spec, content, targetPath, failures);
	} catch (e: any) {
		return {
			specId: spec.id,
			targets: spec.targets,
			status: "failed",
			message: `AI re-derivation failed: ${e?.message ?? String(e)}`,
		};
	}

	if (!edits || edits.length === 0) {
		return {
			specId: spec.id,
			targets: spec.targets,
			status: "failed",
			message: "AI produced no edits",
		};
	}

	// Validate edit uniqueness
	for (const e of edits) {
		const n = countOccurrences(content, e.find);
		if (n === 0) {
			return {
				specId: spec.id,
				targets: spec.targets,
				status: "failed",
				message: `edit find string not present: ${preview(e.find)}`,
				edits,
			};
		}
		if (n > 1) {
			return {
				specId: spec.id,
				targets: spec.targets,
				status: "failed",
				message: `edit find string ambiguous (${n} matches): ${preview(e.find)}`,
				edits,
			};
		}
	}

	let next = content;
	for (const e of edits) {
		const n = countOccurrences(next, e.find);
		if (n !== 1) {
			return {
				specId: spec.id,
				targets: spec.targets,
				status: "failed",
				message: `intermediate state: edit's find has ${n} matches after a prior edit: ${preview(e.find)}`,
				edits,
			};
		}
		next = next.replace(e.find, () => e.replace);
	}

	// Write and re-verify
	fs.writeFileSync(absPath, next, "utf8");
	const post = safeVerify(spec, readTarget);
	if (!post.ok) {
		// Revert the file
		fs.writeFileSync(absPath, content, "utf8");
		return {
			specId: spec.id,
			targets: spec.targets,
			status: "failed",
			message: `verify still failing after AI edits: ${post.failures.join("; ")}`,
			edits,
		};
	}

	// Commit
	const sha = gitCommitAll(
		opts.repoDir,
		`fork-patch(${spec.id}): AI-re-derived for upstream changes\n\nPatch-Id: ${spec.id}\nOriginal-Ref: ${spec.referenceCommit}`,
	);
	return {
		specId: spec.id,
		targets: spec.targets,
		status: "applied-ai-rederive",
		commitSha: sha,
		edits,
	};
}

/**
 * Verify all specs against a working tree without modifying anything.
 * Use this for `--check` mode.
 */
export function verifyAll(specs: ForkPatchSpec[], repoDir: string): ApplyResult[] {
	const readTarget = makeReadTarget(repoDir);
	const results: ApplyResult[] = [];
	for (const spec of specs) {
		const v = safeVerify(spec, readTarget);
		results.push({
			specId: spec.id,
			targets: spec.targets,
			status: v.ok ? "already" : "failed",
			message: v.ok ? undefined : v.failures.join("; "),
		});
	}
	return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReadTarget(repoDir: string): (relPath: string) => string {
	return (relPath: string): string => {
		const abs = path.join(repoDir, relPath);
		return fs.readFileSync(abs, "utf8");
	};
}

function safeVerify(spec: ForkPatchSpec, readTarget: (p: string) => string): VerifyResult {
	try {
		return spec.verify(readTarget);
	} catch (e: any) {
		// Verify threw (file missing, etc.) — treat as failure with the error message.
		return {
			ok: false,
			failures: [`verify threw: ${e?.message ?? String(e)}`],
		};
	}
}

function statusIcon(s: ApplyStatus): string {
	switch (s) {
		case "applied-cherry-pick":
			return "✚";
		case "applied-ai-rederive":
			return "🤖";
		case "already":
			return "✓";
		case "skipped":
			return "⊘";
		case "failed":
			return "✗";
	}
}

function tryCherryPick(
	repoDir: string,
	commit: string,
): { ok: true; sha: string } | { ok: false; empty: boolean } {
	try {
		// `--allow-empty` lets us proceed when upstream already contains the
		// change; we detect that case via empty diff and report `skipped`.
		execFileSync("git", ["cherry-pick", "--allow-empty", "--keep-redundant-commits", commit], {
			cwd: repoDir,
			stdio: "pipe",
		});
		const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
		// Check if the resulting commit changed anything.
		const diff = execFileSync("git", ["diff", "--shortstat", "HEAD~1..HEAD"], {
			cwd: repoDir,
			encoding: "utf8",
		}).trim();
		if (!diff) {
			return { ok: false, empty: true };
		}
		return { ok: true, sha };
	} catch {
		return { ok: false, empty: false };
	}
}

function gitAbortCherryPick(repoDir: string): void {
	try {
		execFileSync("git", ["cherry-pick", "--abort"], { cwd: repoDir, stdio: "pipe" });
	} catch {
		// Not in a cherry-pick state — ignore.
	}
}

function gitResetHard(repoDir: string, ref: string): void {
	execFileSync("git", ["reset", "--hard", ref], { cwd: repoDir, stdio: "pipe" });
}

function gitCommitAll(repoDir: string, message: string): string {
	execFileSync("git", ["add", "-A"], { cwd: repoDir, stdio: "pipe" });
	execFileSync("git", ["commit", "-m", message], { cwd: repoDir, stdio: "pipe" });
	return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
}

function countOccurrences(haystack: string, needle: string): number {
	if (!needle) return 0;
	let count = 0;
	let i = 0;
	while ((i = haystack.indexOf(needle, i)) !== -1) {
		count++;
		i += needle.length;
	}
	return count;
}

function preview(s: string, max = 80): string {
	const oneLine = s.replace(/\n/g, "\\n");
	return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

// ---------------------------------------------------------------------------
// Default AI dispatcher — delegate to `pi --mode json` for a one-shot edit
// derivation. Pi must be on PATH.

function defaultDeriveEdits(opts: ApplyOptions) {
	const piBin = opts.piBin ?? "pi";
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	return async function deriveEdits(
		spec: ForkPatchSpec,
		fileContent: string,
		filePath: string,
		failures: string[],
	): Promise<Edit[]> {
		const prompt = buildPrompt(spec, fileContent, filePath, failures);
		const stdout = await spawnPi(piBin, prompt, timeoutMs);
		return parseEditsResponse(stdout);
	};
}

export function buildPrompt(
	spec: ForkPatchSpec,
	fileContent: string,
	filePath: string,
	failures: string[],
): string {
	return `You are a runtime patcher for the oh-pi fork. Read the source file below
and produce minimal text edits needed to satisfy the SPEC. The cherry-pick of
the reference commit either conflicted with current upstream or produced
content that failed verification.

# SPEC INTENT

${spec.intent}

${spec.hint ? `\n## Hint\n${spec.hint}\n` : ""}

# CURRENT VERIFICATION FAILURES

${failures.map((f) => `- ${f}`).join("\n")}

# CONSTRAINTS

- Output ONLY a JSON object on a single line: {"replacements":[{"find":"...","replace":"..."}, ...]}
- Each "find" string MUST appear EXACTLY ONCE in the file content. Include enough surrounding context to make it unique.
- Do NOT include unrelated changes. Touch only what's needed to satisfy the spec.
- Preserve existing indentation, comments, and surrounding code.
- If the file already satisfies the spec, return {"replacements":[]}.

# FILE CONTENT (target: ${filePath})

\`\`\`ts
${fileContent}
\`\`\`

Respond with the JSON object only. No prose.`;
}

export function parseEditsResponse(raw: string): Edit[] {
	const stripped = raw.trim();
	const direct = tryParseObject(stripped);
	if (direct) return validateEditsShape(direct);
	const fenceMatch = stripped.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	if (fenceMatch?.[1]) {
		const fenced = tryParseObject(fenceMatch[1]);
		if (fenced) return validateEditsShape(fenced);
	}
	const objMatch = stripped.match(/\{[\s\S]*"replacements"[\s\S]*\}/);
	if (objMatch?.[0]) {
		const found = tryParseObject(objMatch[0]);
		if (found) return validateEditsShape(found);
	}
	throw new Error(
		`agent response did not contain a parseable replacements object: ${preview(stripped, 200)}`,
	);
}

function tryParseObject(s: string): unknown {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

function validateEditsShape(parsed: unknown): Edit[] {
	if (!parsed || typeof parsed !== "object") throw new Error("response is not an object");
	const reps = (parsed as any).replacements;
	if (!Array.isArray(reps)) throw new Error("response.replacements is not an array");
	const edits: Edit[] = [];
	for (let i = 0; i < reps.length; i++) {
		const r = reps[i];
		if (!r || typeof r !== "object") throw new Error(`replacements[${i}] is not an object`);
		if (typeof r.find !== "string") throw new Error(`replacements[${i}].find is not a string`);
		if (typeof r.replace !== "string") throw new Error(`replacements[${i}].replace is not a string`);
		edits.push({ find: r.find, replace: r.replace });
	}
	return edits;
}

function spawnPi(piBin: string, prompt: string, timeoutMs: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const args = ["--mode", "json", "-p", prompt, "--no-session", "--no-extensions", "--no-skills"];
		const child = spawn(piBin, args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error(`agent timed out after ${timeoutMs}ms`));
		}, timeoutMs);
		child.stdout.on("data", (b) => (stdout += b.toString("utf8")));
		child.stderr.on("data", (b) => (stderr += b.toString("utf8")));
		child.on("error", (e) => {
			clearTimeout(timer);
			reject(e);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code !== 0) {
				reject(new Error(`pi exited ${code}: ${stderr.slice(-2000)}`));
				return;
			}
			resolve(extractAssistantText(stdout));
		});
	});
}

export function extractAssistantText(jsonStream: string): string {
	const lines = jsonStream.split(/\r?\n/).filter(Boolean);
	let lastText = "";
	for (const line of lines) {
		try {
			const o = JSON.parse(line);
			if (typeof o === "object" && o !== null) {
				const text = pickAssistantText(o);
				if (text) lastText = text;
			}
		} catch {
			lastText = lastText ? `${lastText}\n${line}` : line;
		}
	}
	return lastText;
}

function pickAssistantText(o: any): string | null {
	if (o.role === "assistant" && typeof o.text === "string") return o.text;
	if (typeof o.text === "string" && (o.type === "text" || o.event?.includes?.("assistant"))) {
		return o.text;
	}
	if (Array.isArray(o.content)) {
		const texts = o.content
			.filter((c: any) => c && c.type === "text" && typeof c.text === "string")
			.map((c: any) => c.text);
		if (texts.length) return texts.join("\n");
	}
	if (Array.isArray(o.message?.content)) {
		const texts = o.message.content
			.filter((c: any) => c && c.type === "text" && typeof c.text === "string")
			.map((c: any) => c.text);
		if (texts.length) return texts.join("\n");
	}
	return null;
}
