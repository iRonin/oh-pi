#!/usr/bin/env node
/**
 * oh-pi fork-patches CLI.
 *
 *   npx tsx .fork-patches/cli.ts --check                       # verify all specs against current worktree
 *   npx tsx .fork-patches/cli.ts --check --repo <path>         # verify against a different working tree
 *   npx tsx .fork-patches/cli.ts --apply --repo <staging>      # apply (cherry-pick + AI fallback) against staging
 *   npx tsx .fork-patches/cli.ts --spec <id> --apply --repo .. # single-spec ops
 *   npx tsx .fork-patches/cli.ts --list                        # show spec inventory
 *
 * Exit codes:
 *   0 — all specs verified / applied
 *   1 — one or more specs failed
 *   2 — invocation error (bad args, no specs, missing repo)
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyAll, applyOne, verifyAll, type ApplyResult } from "./applier.ts";
import type { ForkPatchSpec } from "./types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Args {
	mode: "check" | "apply" | "list" | "help";
	repo: string;
	spec?: string;
	json: boolean;
	verbose: boolean;
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		mode: "check",
		repo: path.resolve(__dirname, ".."),
		json: false,
		verbose: false,
	};
	let modeSet = false;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--check" || a === "-c") {
			args.mode = "check";
			modeSet = true;
		} else if (a === "--apply") {
			args.mode = "apply";
			modeSet = true;
		} else if (a === "--list") {
			args.mode = "list";
			modeSet = true;
		} else if (a === "--help" || a === "-h") {
			args.mode = "help";
			modeSet = true;
		} else if (a === "--repo") {
			args.repo = path.resolve(argv[++i]);
		} else if (a === "--spec") {
			args.spec = argv[++i];
		} else if (a === "--json") {
			args.json = true;
		} else if (a === "--verbose" || a === "-v") {
			args.verbose = true;
		} else {
			console.error(`unknown arg: ${a}`);
			process.exit(2);
		}
	}
	if (!modeSet) args.mode = "check"; // default
	return args;
}

function helpText(): string {
	return `oh-pi fork-patches — durable spec-based patcher for the oh-pi fork

Usage:
  npx tsx .fork-patches/cli.ts [--check|--apply|--list] [options]

Modes:
  --check, -c          (default) verify each spec against the working tree, no writes
  --apply              cherry-pick each spec.referenceCommit into --repo; AI-rederive on conflict/verify-fail
  --list               print spec inventory (id, targets, referenceCommit) and exit

Options:
  --repo <path>        target git working tree (default: parent of .fork-patches/)
  --spec <id>          operate on a single spec
  --json               machine-readable output
  --verbose, -v        progress lines to stderr

Exit codes:
  0  all specs ok
  1  one or more failed
  2  invocation error
`;
}

async function loadSpecs(filterId?: string, repoForOrder?: string): Promise<ForkPatchSpec[]> {
	const specsDir = path.join(__dirname, "specs");
	if (!fs.existsSync(specsDir)) return [];
	const loaded: ForkPatchSpec[] = [];
	for (const f of fs.readdirSync(specsDir).sort()) {
		if (!f.endsWith(".ts") && !f.endsWith(".js")) continue;
		const mod = await import(path.join(specsDir, f));
		const s: ForkPatchSpec | undefined = mod.spec ?? mod.default;
		if (!s || typeof s.id !== "string" || typeof s.verify !== "function") continue;
		if (filterId && s.id !== filterId) continue;
		loaded.push(s);
	}
	// Sort by referenceCommit's commit-date so prerequisite patches apply
	// before dependents. Falls back to alphabetical id when a commit can't be
	// resolved (e.g. running --list without --repo).
	if (!repoForOrder) return loaded;
	const dates = new Map<string, number>();
	for (const s of loaded) {
		try {
			const ts = execFileSync("git", ["show", "-s", "--format=%ct", s.referenceCommit], {
				cwd: repoForOrder,
				encoding: "utf8",
				stdio: ["pipe", "pipe", "ignore"],
			}).trim();
			const n = Number(ts);
			if (Number.isFinite(n)) dates.set(s.id, n);
		} catch {
			/* leave unset — sorts last */
		}
	}
	loaded.sort((a, b) => {
		const da = dates.get(a.id) ?? Number.POSITIVE_INFINITY;
		const db = dates.get(b.id) ?? Number.POSITIVE_INFINITY;
		if (da !== db) return da - db;
		return a.id.localeCompare(b.id);
	});
	return loaded;
}

function summarize(results: ApplyResult[]) {
	let ok = 0;
	let already = 0;
	let skipped = 0;
	let failed = 0;
	for (const r of results) {
		if (r.status === "applied-cherry-pick" || r.status === "applied-ai-rederive") ok++;
		else if (r.status === "already") already++;
		else if (r.status === "skipped") skipped++;
		else if (r.status === "failed") failed++;
	}
	return { ok, already, skipped, failed };
}

function emit(results: ApplyResult[], json: boolean, mode: "check" | "apply") {
	if (json) {
		console.log(JSON.stringify({ mode, results }, null, 2));
		return;
	}
	const head = mode === "check" ? "fork-patches --check" : "fork-patches --apply";
	console.log(`\n${head}\n${"─".repeat(head.length)}`);
	for (const r of results) {
		const icon =
			r.status === "applied-cherry-pick"
				? "✚"
				: r.status === "applied-ai-rederive"
					? "🤖"
					: r.status === "already"
						? "✓"
						: r.status === "skipped"
							? "⊘"
							: "✗";
		const status =
			r.status === "applied-cherry-pick"
				? "cherry-picked"
				: r.status === "applied-ai-rederive"
					? "ai-rederived"
					: r.status === "already"
						? mode === "check"
							? "verified"
							: "already"
						: r.status;
		const sha = r.commitSha ? ` [${r.commitSha.slice(0, 8)}]` : "";
		console.log(`  ${icon} ${r.specId.padEnd(36)} ${status}${sha}${r.message ? ` — ${r.message}` : ""}`);
	}
	const counts = summarize(results);
	const total = results.length;
	console.log(
		`\n${total} specs — ${counts.ok} new, ${counts.already} already, ${counts.skipped} skipped, ${counts.failed} failed\n`,
	);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.mode === "help") {
		console.log(helpText());
		process.exit(0);
	}

	// For --check we don't strictly need ordering, but for --apply and --list
	// (when a repo is set), ordering by commit-date keeps prerequisites first.
	const orderRepo = fs.existsSync(path.join(args.repo, ".git")) ? args.repo : undefined;
	const specs = await loadSpecs(args.spec, orderRepo);
	if (specs.length === 0) {
		const msg = args.spec ? `no spec named '${args.spec}'` : "no specs found in .fork-patches/specs/";
		if (args.json) console.log(JSON.stringify({ error: msg, results: [] }));
		else console.error(`error: ${msg}`);
		process.exit(2);
	}

	if (args.mode === "list") {
		if (args.json) {
			console.log(
				JSON.stringify(
					specs.map((s) => ({ id: s.id, targets: s.targets, referenceCommit: s.referenceCommit })),
					null,
					2,
				),
			);
		} else {
			console.log(`\n${specs.length} fork-patch specs:\n`);
			for (const s of specs) {
				console.log(`  ${s.id}`);
				console.log(`    targets: ${s.targets.join(", ")}`);
				console.log(`    ref:     ${s.referenceCommit.slice(0, 8)}`);
			}
			console.log();
		}
		process.exit(0);
	}

	// Validate --repo
	if (!fs.existsSync(path.join(args.repo, ".git"))) {
		console.error(`error: --repo ${args.repo} is not a git working tree`);
		process.exit(2);
	}

	if (args.mode === "check") {
		const results = verifyAll(specs, args.repo);
		emit(results, args.json, "check");
		const c = summarize(results);
		process.exit(c.failed > 0 ? 1 : 0);
	}

	// apply
	const results = await applyAll(specs, { repoDir: args.repo, verbose: args.verbose });
	emit(results, args.json, "apply");
	const c = summarize(results);
	process.exit(c.failed > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error("fork-patches crashed:", e?.stack ?? e?.message ?? e);
	process.exit(2);
});
