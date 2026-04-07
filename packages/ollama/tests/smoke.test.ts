import { describe, expect, it } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import ollamaCloudProviderExtension from "../index.js";

describe("ollama cloud provider smoke tests", () => {
	it("registers the ollama cloud provider and command without crashing", () => {
		const harness = createExtensionHarness();
		ollamaCloudProviderExtension(harness.pi as never);

		expect(harness.commands.has("ollama-cloud")).toBe(true);
		expect(harness.providers.has("ollama-cloud")).toBe(true);
	});
});
