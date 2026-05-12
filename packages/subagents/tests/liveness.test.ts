import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AsyncStatus } from "../types.js";
import { readStatus, reconcileLiveness } from "../utils.js";

const tempDirs: string[] = [];

function createTempDir(prefix: string) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

/** Build a fully-typed AsyncStatus with overrides. */
function makeStatus(overrides: Partial<AsyncStatus> = {}): AsyncStatus {
	return {
		runId: "run-test",
		mode: "single",
		state: "running",
		startedAt: Date.now() - 60_000,
		lastUpdate: Date.now() - 60_000,
		...overrides,
	};
}

/**
 * Spawn a short-lived child, wait for it to exit, and return its (now-dead)
 * PID. PID reuse is theoretically possible but extremely unlikely in the
 * sub-second window the tests run — and the surrounding ESRCH branch is the
 * exact behaviour we want to verify, so this is acceptable for our intent.
 */
function getDeadPid(): number {
	const child = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
	if (child.pid === undefined) throw new Error("failed to spawn child");
	return child.pid;
}

beforeEach(() => {
	vi.useRealTimers();
});

afterEach(() => {
	for (const dir of tempDirs) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
	tempDirs.length = 0;
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("reconcileLiveness", () => {
	it("returns status unchanged when state is not running", () => {
		const status = makeStatus({ state: "complete", pid: 99999, endedAt: Date.now() });
		const statusPath = path.join(createTempDir("pi-liveness-"), "status.json");
		fs.writeFileSync(statusPath, JSON.stringify(status));

		const result = reconcileLiveness(status, statusPath);

		// Identity preserved: terminal states are sticky regardless of PID liveness.
		expect(result).toBe(status);
	});

	it("returns status unchanged when no pid is set (legacy run)", () => {
		const status = makeStatus({ pid: undefined });
		const statusPath = path.join(createTempDir("pi-liveness-"), "status.json");
		fs.writeFileSync(statusPath, JSON.stringify(status));

		const result = reconcileLiveness(status, statusPath);

		expect(result).toBe(status);
	});

	it("returns status unchanged when the worker PID is still alive", () => {
		// The current test process is guaranteed alive.
		const status = makeStatus({ pid: process.pid });
		const statusPath = path.join(createTempDir("pi-liveness-"), "status.json");
		fs.writeFileSync(statusPath, JSON.stringify(status));

		const result = reconcileLiveness(status, statusPath);

		expect(result).toBe(status);
		expect(result.state).toBe("running");
	});

	it("transitions to killed when PID is dead and lastUpdate is older than grace window", () => {
		const dir = createTempDir("pi-liveness-");
		const statusPath = path.join(dir, "status.json");
		const status = makeStatus({
			pid: getDeadPid(),
			lastUpdate: Date.now() - 60_000,
			startedAt: Date.now() - 120_000,
		});
		fs.writeFileSync(statusPath, JSON.stringify(status));

		const result = reconcileLiveness(status, statusPath);

		expect(result.state).toBe("killed");
		expect(result.endedAt).toBeGreaterThan(status.startedAt);
		// Preserves identifying fields.
		expect(result.runId).toBe(status.runId);
		expect(result.pid).toBe(status.pid);
	});

	it("respects the 5s grace window for racing worker shutdowns", () => {
		const dir = createTempDir("pi-liveness-");
		const statusPath = path.join(dir, "status.json");
		// lastUpdate within the last 5s — even though PID is dead, the worker
		// may be in the middle of writing its terminal status.
		const status = makeStatus({
			pid: getDeadPid(),
			lastUpdate: Date.now() - 1000,
		});
		fs.writeFileSync(statusPath, JSON.stringify(status));

		const result = reconcileLiveness(status, statusPath);

		// Intent: avoid clobbering an in-flight complete/failed write.
		expect(result.state).toBe("running");
		expect(result).toBe(status);
	});

	it("persists the killed state to disk atomically", () => {
		const dir = createTempDir("pi-liveness-");
		const statusPath = path.join(dir, "status.json");
		const status = makeStatus({
			pid: getDeadPid(),
			lastUpdate: Date.now() - 60_000,
		});
		fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));

		reconcileLiveness(status, statusPath);

		// Re-read from disk — confirm the kill was persisted, not just returned.
		const onDisk = JSON.parse(fs.readFileSync(statusPath, "utf8")) as AsyncStatus;
		expect(onDisk.state).toBe("killed");
		expect(onDisk.endedAt).toBeGreaterThan(0);
		// No leftover tmp file from the atomic rename.
		const tmpFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"));
		expect(tmpFiles).toEqual([]);
	});

	it("treats EPERM as alive (PID exists but owned by another user)", () => {
		const status = makeStatus({
			pid: 1, // pid we'd hit EPERM on if any — but we mock instead for determinism
			lastUpdate: Date.now() - 60_000,
		});
		const statusPath = path.join(createTempDir("pi-liveness-"), "status.json");
		fs.writeFileSync(statusPath, JSON.stringify(status));

		const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
			const err = new Error("operation not permitted") as NodeJS.ErrnoException;
			err.code = "EPERM";
			throw err;
		});

		const result = reconcileLiveness(status, statusPath);

		expect(killSpy).toHaveBeenCalledWith(1, 0);
		expect(result).toBe(status);
		expect(result.state).toBe("running");
	});

	it("readStatus surfaces the killed state and refreshes the cached entry", () => {
		const dir = createTempDir("pi-liveness-");
		const statusPath = path.join(dir, "status.json");
		const status = makeStatus({
			pid: getDeadPid(),
			lastUpdate: Date.now() - 60_000,
		});
		fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));

		const first = readStatus(dir);
		expect(first?.state).toBe("killed");

		// A second call must keep returning the killed state — not flip back
		// to "running" from a stale cache.
		const second = readStatus(dir);
		expect(second?.state).toBe("killed");
	});
});
