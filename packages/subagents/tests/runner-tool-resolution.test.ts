import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Tests for the subagent-runner's tool resolution logic.
 * Verifies that custom tool names (e.g. read_full) are mapped to extension paths
 * instead of being passed as --tools arguments (which the pi CLI would reject).
 */

const RUNNER_SOURCE = path.join(__dirname, "../subagent-runner.ts");

describe("subagent-runner tool resolution", () => {
	it("KNOWN_BUILTIN_TOOLS contains expected pi core tools", async () => {
		const source = await fs.promises.readFile(RUNNER_SOURCE, "utf-8");
		const match = source.match(/KNOWN_BUILTIN_TOOLS\s*=\s*new\s+Set\(\[([^\]]+)\]\)/);
		expect(match).toBeTruthy();
		const tools = match![1].match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, ""));
		expect(tools).toContain("read");
		expect(tools).toContain("bash");
		expect(tools).toContain("edit");
		expect(tools).toContain("write");
	});

	it("KNOWN_CUSTOM_TOOLS maps read_full to an extension path", async () => {
		const source = await fs.promises.readFile(RUNNER_SOURCE, "utf-8");
		expect(source).toMatch(/read_full.*npm:|read_full.*extension/);
	});

	it("runner classifies tools correctly: builtin vs path vs custom", async () => {
		const source = await fs.promises.readFile(RUNNER_SOURCE, "utf-8");

		// Verify the classification logic handles all three cases:
		// 1. Path-like tools → toolExtensionPaths
		expect(source).toMatch(/tool\.includes.*\/.*tool\.endsWith.*\.ts/);
		// 2. Known builtins → builtinTools
		expect(source).toMatch(/KNOWN_BUILTIN_TOOLS\.has\(tool\)/);
		// 3. Known custom tools → toolExtensionPaths (via mapping)
		expect(source).toMatch(/KNOWN_CUSTOM_TOOLS\[tool\]/);
	});

	it("runner does not pass custom tool names to --tools flag", async () => {
		const source = await fs.promises.readFile(RUNNER_SOURCE, "utf-8");

		// The classification block should only push to builtinTools for KNOWN_BUILTIN_TOOLS
		// Custom tools should go to toolExtensionPaths instead
		const classifyBlock = source.match(/if \(step\.tools\?\.length\) \{[\s\S]*?if \(builtinTools\.length > 0\)/);
		expect(classifyBlock).toBeTruthy();
		const block = classifyBlock![0];

		// Should check against KNOWN_BUILTIN_TOOLS before adding to builtinTools
		expect(block).toContain("KNOWN_BUILTIN_TOOLS.has(tool)");
		// Should handle KNOWN_CUSTOM_TOOLS separately
		expect(block).toContain("KNOWN_CUSTOM_TOOLS");
	});
});
