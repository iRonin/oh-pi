import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock render.js so we don't pull in @earendil-works/pi-tui (unresolvable in the
// test sandbox) — the poller only calls renderWidget as a side effect.
// Mock readStatus so we drive the worker state machine deterministically,
// without real files, PIDs, or the liveness grace-window timing.
// vi.hoisted: factories are hoisted above imports, so the fns must be too.
const mocks = vi.hoisted(() => ({ renderWidget: vi.fn(), readStatus: vi.fn() }));
vi.mock("../render.js", () => ({ renderWidget: mocks.renderWidget }));
vi.mock("../utils.js", () => ({ readStatus: mocks.readStatus }));
const { renderWidget, readStatus } = mocks;

import type { AsyncJobState, AsyncStatus } from "../types.js";

import { createSubagentRuntimeMonitor } from "../runtime-monitor.js";
import { POLL_INTERVAL_MS, RESULTS_DIR } from "../types.js";

function makeJob(overrides: Partial<AsyncJobState> = {}): AsyncJobState {
	return {
		asyncId: "job-1",
		asyncDir: "/tmp/run/job-1",
		status: "running",
		mode: "single",
		agents: ["scout"],
		startedAt: Date.now() - 60_000,
		updatedAt: Date.now() - 60_000,
		...overrides,
	};
}

function makeStatus(overrides: Partial<AsyncStatus> = {}): AsyncStatus {
	return {
		runId: "job-1",
		mode: "single",
		state: "running",
		startedAt: Date.now() - 60_000,
		lastUpdate: Date.now(),
		...overrides,
	};
}

let monitor: ReturnType<typeof createSubagentRuntimeMonitor> | null = null;

beforeEach(() => {
	fs.mkdirSync(RESULTS_DIR, { recursive: true });
	vi.useFakeTimers();
	renderWidget.mockReset();
	readStatus.mockReset();
});

afterEach(() => {
	monitor?.stop();
	monitor = null;
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function buildMonitor(asyncJobs: Map<string, AsyncJobState>, onJobTerminal = vi.fn()) {
	monitor = createSubagentRuntimeMonitor({
		asyncJobs,
		getBaseCwd: () => "/tmp",
		getCurrentSessionId: () => "sess-1",
		getLastUiContext: () => ({ hasUI: true }) as never,
		getSafeModeEnabled: () => false,
		onJobTerminal,
		pi: { events: { emit: vi.fn() } } as never,
	});
	return onJobTerminal;
}

describe("runtime monitor — killed job lifecycle", () => {
	it("signals onJobTerminal exactly once when a running job transitions to killed", () => {
		const jobs = new Map<string, AsyncJobState>([["job-1", makeJob()]]);
		readStatus.mockReturnValue(makeStatus({ state: "killed", endedAt: Date.now() }));
		const onJobTerminal = buildMonitor(jobs);

		monitor!.ensurePoller();
		vi.advanceTimersByTime(POLL_INTERVAL_MS);

		// Intent: the poller must propagate the externally-detected kill so the
		// overlay can be cleaned up — without this the row sticks forever.
		expect(jobs.get("job-1")!.status).toBe("killed");
		expect(onJobTerminal).toHaveBeenCalledTimes(1);
		expect(onJobTerminal).toHaveBeenCalledWith("job-1");

		// A killed job is terminal: subsequent polls must NOT re-signal it.
		vi.advanceTimersByTime(POLL_INTERVAL_MS * 3);
		expect(onJobTerminal).toHaveBeenCalledTimes(1);
	});

	it("does not signal onJobTerminal for jobs that stay running", () => {
		const jobs = new Map<string, AsyncJobState>([["job-1", makeJob()]]);
		readStatus.mockReturnValue(makeStatus({ state: "running" }));
		const onJobTerminal = buildMonitor(jobs);

		monitor!.ensurePoller();
		vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);

		expect(jobs.get("job-1")!.status).toBe("running");
		expect(onJobTerminal).not.toHaveBeenCalled();
	});
});
