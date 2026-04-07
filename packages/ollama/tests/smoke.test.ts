import { describe, expect, it } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import ollamaProviderExtension from "../index.js";

describe("ollama provider smoke tests", () => {
	it("registers local + cloud ollama providers and commands without crashing", () => {
		const harness = createExtensionHarness();
		ollamaProviderExtension(harness.pi as never);

		expect(harness.commands.has("ollama")).toBe(true);
		expect(harness.commands.has("ollama-cloud")).toBe(true);
		expect(harness.providers.has("ollama")).toBe(true);
		expect(harness.providers.has("ollama-cloud")).toBe(true);
	});
});
