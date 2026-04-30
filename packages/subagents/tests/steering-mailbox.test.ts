import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { drainSteerMailbox, readSteerMailbox, steerMailboxPath, writeSteerMessage } from "../utils.js";
import type { SteerMessage } from "../types.js";

describe("steering mailbox", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = fs.mkdtempSync(path.join(os.tmpdir(), "steer-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(testDir, { recursive: true, force: true });
		} catch {}
	});

	it("steerMailboxPath returns the correct path", () => {
		const p = steerMailboxPath(testDir);
		expect(p).toBe(path.join(testDir, "steer.json"));
	});

	it("readSteerMailbox returns empty array when file doesn't exist", () => {
		const msgs = readSteerMailbox(testDir);
		expect(msgs).toEqual([]);
	});

	it("writeSteerMessage creates the mailbox file", () => {
		const msg: SteerMessage = {
			id: "steer-1",
			type: "follow-up",
			text: "Also check X",
			ts: Date.now(),
		};
		writeSteerMessage(testDir, msg);

		const p = steerMailboxPath(testDir);
		expect(fs.existsSync(p)).toBe(true);

		const msgs = readSteerMailbox(testDir);
		expect(msgs).toHaveLength(1);
		expect(msgs[0]).toEqual(msg);
	});

	it("writeSteerMessage appends without overwriting existing messages", () => {
		const msg1: SteerMessage = { id: "steer-1", type: "follow-up", text: "First", ts: 1000 };
		const msg2: SteerMessage = { id: "steer-2", type: "direction", text: "Second", ts: 2000 };
		writeSteerMessage(testDir, msg1);
		writeSteerMessage(testDir, msg2);

		const msgs = readSteerMailbox(testDir);
		expect(msgs).toHaveLength(2);
		expect(msgs[0].id).toBe("steer-1");
		expect(msgs[1].id).toBe("steer-2");
	});

	it("writeSteerMessage deduplicates by id", () => {
		const msg: SteerMessage = { id: "steer-1", type: "follow-up", text: "First", ts: 1000 };
		const dup: SteerMessage = { id: "steer-1", type: "follow-up", text: "Duplicate", ts: 2000 };
		writeSteerMessage(testDir, msg);
		writeSteerMessage(testDir, dup);

		const msgs = readSteerMailbox(testDir);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].text).toBe("First");
	});

	it("drainSteerMailbox returns all messages and removes the file", () => {
		const msg1: SteerMessage = { id: "steer-1", type: "follow-up", text: "First", ts: 1000 };
		const msg2: SteerMessage = { id: "steer-2", type: "cancel", text: "Stop", ts: 2000 };
		writeSteerMessage(testDir, msg1);
		writeSteerMessage(testDir, msg2);

		const drained = drainSteerMailbox(testDir);
		expect(drained).toHaveLength(2);
		expect(drained[0].id).toBe("steer-1");
		expect(drained[1].id).toBe("steer-2");

		// File should be deleted
		expect(fs.existsSync(steerMailboxPath(testDir))).toBe(false);

		// Draining again returns empty
		const empty = drainSteerMailbox(testDir);
		expect(empty).toEqual([]);
	});

	it("drainSteerMailbox returns empty for nonexistent file", () => {
		const msgs = drainSteerMailbox(testDir);
		expect(msgs).toEqual([]);
	});

	it("cancel messages are preserved and returned correctly", () => {
		const cancelMsg: SteerMessage = { id: "cancel-1", type: "cancel", text: "Stop processing", ts: 3000 };
		writeSteerMessage(testDir, cancelMsg);

		const msgs = readSteerMailbox(testDir);
		expect(msgs).toHaveLength(1);
		expect(msgs[0].type).toBe("cancel");
	});
});
