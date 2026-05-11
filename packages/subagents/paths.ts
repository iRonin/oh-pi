import path from "node:path";
import os from "node:os";

// Inline copy of pi's getAgentDir() to avoid importing from
// @earendil-works/pi-coding-agent. That import works fine when paths.ts is
// loaded inside the parent pi process (module already cached), but it fails
// when subagent-runner.ts is spawned as a fresh detached child:
//
//   ERR_MODULE_NOT_FOUND  (pi is globally installed; resolver can't find it)
//   ERR_PACKAGE_PATH_NOT_EXPORTED  (pi v0.74.0+ is ESM-only; jiti's CJS shim
//                                   can't resolve the "." export)
//
// As a result every async subagent run crashed silently before writing
// status.json — they showed up as "running" in the TUI forever. Inlining the
// trivial getAgentDir() removes the import chain.
//
// Source: /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/config.js
//   export function getAgentDir() {
//       const envDir = process.env[ENV_AGENT_DIR];  // "PI_CODING_AGENT_DIR"
//       if (envDir) return expandTildePath(envDir);
//       return join(homedir(), CONFIG_DIR_NAME, "agent");  // ".pi/agent"
//   }
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

export function getSubagentConfigPath(): string {
	return path.join(resolveAgentDir(), "extensions", "subagent", "config.json");
}

export function getUserAgentsDir(): string {
	return path.join(resolveAgentDir(), "agents");
}

export function getSessionsBaseDir(): string {
	return path.join(resolveAgentDir(), "sessions");
}

export function getRunHistoryPath(): string {
	return path.join(resolveAgentDir(), "run-history.jsonl");
}
