/**
 * Subagent completion notifications (extension)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as child_process from "node:child_process";

import { buildCompletionKey, getGlobalSeenMap, markSeenWithTtl } from "./completion-dedupe.js";

/**
 * Play a soft ding when an async subagent finishes.
 * Ping.aiff + terminal bell.
 */
function agentDoneSound(): void {
	process.stdout.write("\x07");
	try {
		const child = child_process.spawn(
			"/usr/bin/afplay",
			["/System/Library/Sounds/Ping.aiff"],
			{ detached: true, stdio: "ignore" },
		);
		child.unref();
	} catch {}
}

interface ChainStepResult {
	agent: string;
	output: string;
	success: boolean;
}

interface SubagentResult {
	id: string | null;
	agent: string | null;
	success: boolean;
	summary: string;
	exitCode: number;
	timestamp: number;
	sessionFile?: string;
	shareUrl?: string;
	gistUrl?: string;
	shareError?: string;
	results?: ChainStepResult[];
	taskIndex?: number;
	totalTasks?: number;
}

export default function registerSubagentNotify(pi: ExtensionAPI): void {
	const seen = getGlobalSeenMap("__pi_subagents_notify_seen__");
	const ttlMs = 10 * 60 * 1000;

	const handleComplete = (data: unknown) => {
		const result = data as SubagentResult;
		const now = Date.now();
		const key = buildCompletionKey(result, "notify");
		if (markSeenWithTtl(seen, key, now, ttlMs)) {
			return;
		}

		// Play attention sound — this is the ONLY place it fires,
		// so users get notified when a background task actually finishes.
		agentDoneSound();

		const agent = result.agent ?? "unknown";
		const status = result.success ? "completed" : "failed";

		const taskInfo =
			result.taskIndex !== undefined && result.totalTasks !== undefined
				? ` (${result.taskIndex + 1}/${result.totalTasks})`
				: "";

		const extra: string[] = [];
		if (result.shareUrl) {
			extra.push(`Session: ${result.shareUrl}`);
		} else if (result.shareError) {
			extra.push(`Session share error: ${result.shareError}`);
		} else if (result.sessionFile) {
			extra.push(`Session file: ${result.sessionFile}`);
		}

		const content = [
			`Background task ${status}: **${agent}**${taskInfo}`,
			"",
			result.summary,
			extra.length > 0 ? "" : undefined,
			extra.length > 0 ? extra.join("\n") : undefined,
		]
			.filter((line) => line !== undefined)
			.join("\n");

		pi.sendMessage(
			{
				content,
				customType: "subagent-notify",
				display: true,
			},
			{ triggerTurn: true },
		);
	};

	pi.events.on("subagent:complete", handleComplete);
}
