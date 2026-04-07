import { afterEach, describe, expect, it, vi } from "vitest";
import { createOllamaCloudOAuthProvider, loginOllamaCloud, refreshOllamaCloudCredential } from "../auth.js";
import { createTestOllamaCloudBackend } from "./test-backend.js";

const envSnapshot = { ...process.env };

afterEach(() => {
	for (const key of Object.keys(process.env)) {
		if (!(key in envSnapshot)) {
			delete process.env[key];
		}
	}
	Object.assign(process.env, envSnapshot);
});

describe("ollama cloud auth", () => {
	it("opens the keys page and exchanges a pasted API key for a static credential with discovered models", async () => {
		const backend = await createTestOllamaCloudBackend();
		backend.setModels([{ id: "gpt-oss:120b", capabilities: ["completion", "tools", "thinking"], contextWindow: 131072 }]);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.apiUrl.replace(/\/v1$/, "")}/api/show`;
		process.env.PI_OLLAMA_CLOUD_KEYS_URL = backend.keysUrl;

		let openedUrl = "";
		const credential = await loginOllamaCloud({
			onAuth(params) {
				openedUrl = params.url;
			},
			onPrompt: vi.fn(async () => "test-key"),
		});

		expect(openedUrl).toBe(backend.keysUrl);
		expect(credential.access).toBe("test-key");
		expect(credential.models?.[0]?.id).toBe("gpt-oss:120b");
		await backend.close();
	});

	it("refreshes credentials and preserves discovered models when discovery fails", async () => {
		const backend = await createTestOllamaCloudBackend();
		backend.setRejectAuth(true);
		process.env.PI_OLLAMA_CLOUD_API_URL = backend.apiUrl;
		process.env.PI_OLLAMA_CLOUD_MODELS_URL = `${backend.apiUrl}/models`;
		process.env.PI_OLLAMA_CLOUD_SHOW_URL = `${backend.apiUrl.replace(/\/v1$/, "")}/api/show`;

		const refreshed = await refreshOllamaCloudCredential({
			refresh: "test-key",
			access: "test-key",
			expires: Date.now() - 1000,
			models: [{ id: "qwen3-next:80b", name: "Qwen3 Next 80B", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 262144, maxTokens: 32768 }],
		} as never);

		expect(refreshed.models?.[0]?.id).toBe("qwen3-next:80b");
		await backend.close();
	});

	it("modifies provider models from credential-discovered models", () => {
		const provider = createOllamaCloudOAuthProvider();
		const modified = provider.modifyModels?.(
			[
				{ id: "placeholder", name: "Placeholder", api: "openai-completions", provider: "ollama-cloud", baseUrl: "https://example.com/v1", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1, maxTokens: 1 },
			],
			{
				refresh: "r",
				access: "a",
				expires: Date.now() + 1000,
				models: [{ id: "gpt-oss:120b", name: "GPT OSS 120B", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 131072, maxTokens: 16384 }],
			} as never,
		);

		expect(modified?.map((model) => model.id)).toEqual(["gpt-oss:120b"]);
	});
});
