import type { Api, Model, OAuthCredentials } from "@mariozechner/pi-ai";
import { getOllamaCloudRuntimeConfig, getOllamaLocalRuntimeConfig, type OllamaRuntimeConfig } from "./config.js";

export type OllamaModelSource = "local" | "cloud";

export type OllamaProviderModel = {
	id: string;
	name: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	contextWindow: number;
	maxTokens: number;
	compat?: Model<Api>["compat"];
	source?: OllamaModelSource;
};

export type OllamaCloudProviderModel = OllamaProviderModel;

export type OllamaCloudCredentials = OAuthCredentials & {
	models?: OllamaProviderModel[];
	lastModelRefresh?: number;
};

type OllamaListedModel = {
	id?: string;
	object?: string;
};

type OllamaShowResponse = {
	capabilities?: unknown;
	model_info?: Record<string, unknown>;
};

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;
const MAX_DISCOVERY_CONCURRENCY = 6;

const OLLAMA_OPENAI_COMPAT: NonNullable<OllamaProviderModel["compat"]> = {
	supportsDeveloperRole: false,
	supportsReasoningEffort: true,
	reasoningEffortMap: {
		minimal: "low",
		low: "low",
		medium: "medium",
		high: "high",
		xhigh: "high",
	},
	maxTokensField: "max_tokens",
};

const FALLBACK_OLLAMA_CLOUD_MODELS: OllamaProviderModel[] = [
	toOllamaModel({ id: "cogito-2.1:671b", source: "cloud", reasoning: true, input: ["text"], contextWindow: 163_840, maxTokens: 20_480 }),
	toOllamaModel({ id: "deepseek-v3.1:671b", source: "cloud", reasoning: true, input: ["text"], contextWindow: 163_840, maxTokens: 20_480 }),
	toOllamaModel({ id: "deepseek-v3.2", source: "cloud", reasoning: true, input: ["text"], contextWindow: 163_840, maxTokens: 20_480 }),
	toOllamaModel({ id: "devstral-2:123b", source: "cloud", reasoning: false, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "devstral-small-2:24b", source: "cloud", reasoning: false, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "gemini-3-flash-preview", source: "cloud", reasoning: true, input: ["text"], contextWindow: 1_048_576, maxTokens: 65_536 }),
	toOllamaModel({ id: "gemma3:12b", source: "cloud", reasoning: false, input: ["text", "image"], contextWindow: 131_072, maxTokens: 16_384 }),
	toOllamaModel({ id: "gemma3:27b", source: "cloud", reasoning: false, input: ["text", "image"], contextWindow: 131_072, maxTokens: 16_384 }),
	toOllamaModel({ id: "gemma3:4b", source: "cloud", reasoning: false, input: ["text", "image"], contextWindow: 131_072, maxTokens: 16_384 }),
	toOllamaModel({ id: "gemma4:31b", source: "cloud", reasoning: true, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "glm-4.6", source: "cloud", reasoning: true, input: ["text"], contextWindow: 202_752, maxTokens: 25_344 }),
	toOllamaModel({ id: "glm-4.7", source: "cloud", reasoning: true, input: ["text"], contextWindow: 202_752, maxTokens: 25_344 }),
	toOllamaModel({ id: "glm-5", source: "cloud", reasoning: true, input: ["text"], contextWindow: 202_752, maxTokens: 25_344 }),
	toOllamaModel({ id: "gpt-oss:120b", source: "cloud", reasoning: true, input: ["text"], contextWindow: 131_072, maxTokens: 16_384 }),
	toOllamaModel({ id: "gpt-oss:20b", source: "cloud", reasoning: true, input: ["text"], contextWindow: 131_072, maxTokens: 16_384 }),
	toOllamaModel({ id: "kimi-k2-thinking", source: "cloud", reasoning: true, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "kimi-k2.5", source: "cloud", reasoning: true, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "kimi-k2:1t", source: "cloud", reasoning: false, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "minimax-m2", source: "cloud", reasoning: false, input: ["text"], contextWindow: 204_800, maxTokens: 25_600 }),
	toOllamaModel({ id: "minimax-m2.1", source: "cloud", reasoning: true, input: ["text"], contextWindow: 204_800, maxTokens: 25_600 }),
	toOllamaModel({ id: "minimax-m2.5", source: "cloud", reasoning: true, input: ["text"], contextWindow: 204_800, maxTokens: 25_600 }),
	toOllamaModel({ id: "minimax-m2.7", source: "cloud", reasoning: true, input: ["text"], contextWindow: 204_800, maxTokens: 25_600 }),
	toOllamaModel({ id: "ministral-3:14b", source: "cloud", reasoning: false, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "ministral-3:3b", source: "cloud", reasoning: false, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "ministral-3:8b", source: "cloud", reasoning: false, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "mistral-large-3:675b", source: "cloud", reasoning: false, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "nemotron-3-nano:30b", source: "cloud", reasoning: true, input: ["text"], contextWindow: 1_048_576, maxTokens: 65_536 }),
	toOllamaModel({ id: "nemotron-3-super", source: "cloud", reasoning: true, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "qwen3-coder-next", source: "cloud", reasoning: false, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "qwen3-coder:480b", source: "cloud", reasoning: false, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "qwen3-next:80b", source: "cloud", reasoning: true, input: ["text"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "qwen3-vl:235b", source: "cloud", reasoning: true, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "qwen3-vl:235b-instruct", source: "cloud", reasoning: false, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "qwen3.5:397b", source: "cloud", reasoning: true, input: ["text", "image"], contextWindow: 262_144, maxTokens: 32_768 }),
	toOllamaModel({ id: "rnj-1:8b", source: "cloud", reasoning: false, input: ["text"], contextWindow: 32_768, maxTokens: 16_384 }),
];

export function getFallbackOllamaCloudModels(): OllamaProviderModel[] {
	return FALLBACK_OLLAMA_CLOUD_MODELS.map(cloneModel);
}

export function getFallbackOllamaLocalModels(): OllamaProviderModel[] {
	return [];
}

export function getCredentialModels(credentials: OllamaCloudCredentials): OllamaProviderModel[] {
	const models = Array.isArray(credentials.models) ? credentials.models : [];
	return models.length > 0 ? sanitizeStoredModels(models) : getFallbackOllamaCloudModels();
}

export async function discoverOllamaLocalModels(options: { signal?: AbortSignal } = {}): Promise<OllamaProviderModel[] | null> {
	return discoverOllamaModels(getOllamaLocalRuntimeConfig(), {
		source: "local",
		signal: options.signal,
	});
}

export async function discoverOllamaCloudModels(apiKey: string, options: { signal?: AbortSignal } = {}): Promise<OllamaProviderModel[] | null> {
	return discoverOllamaModels(getOllamaCloudRuntimeConfig(), {
		source: "cloud",
		apiKey,
		fallbackModels: getFallbackOllamaCloudModels(),
		signal: options.signal,
	});
}

export async function enrichOllamaCloudCredentials(
	credentials: OAuthCredentials,
	options: { previous?: OllamaCloudCredentials; signal?: AbortSignal } = {},
): Promise<OllamaCloudCredentials> {
	let models: OllamaProviderModel[] | undefined;
	try {
		models = (await discoverOllamaCloudModels(credentials.access, { signal: options.signal })) ?? undefined;
	} catch {
		models = undefined;
	}
	return {
		...options.previous,
		...credentials,
		models: models ?? options.previous?.models ?? getFallbackOllamaCloudModels(),
		lastModelRefresh: Date.now(),
	};
}

export function toProviderModels(models: OllamaProviderModel[]): OllamaProviderModel[] {
	return sanitizeStoredModels(models);
}

export function toOllamaModel(model: Partial<OllamaProviderModel> & Pick<OllamaProviderModel, "id">): OllamaProviderModel {
	const contextWindow = normalizePositiveInteger(model.contextWindow, DEFAULT_CONTEXT_WINDOW);
	const maxTokens = normalizePositiveInteger(model.maxTokens, inferMaxTokens(contextWindow));
	return {
		id: model.id,
		name: model.name?.trim() || formatDisplayName(model.id),
		reasoning: model.reasoning ?? false,
		input: sanitizeInput(model.input),
		cost: model.cost ? { ...model.cost } : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow,
		maxTokens,
		compat: { ...OLLAMA_OPENAI_COMPAT, ...(model.compat ?? {}) },
		source: model.source,
	};
}

export const toOllamaCloudModel = toOllamaModel;

async function discoverOllamaModels(
	config: OllamaRuntimeConfig,
	options: {
		source: OllamaModelSource;
		apiKey?: string;
		fallbackModels?: readonly OllamaProviderModel[];
		signal?: AbortSignal;
	},
): Promise<OllamaProviderModel[] | null> {
	const listed = await fetchJson<{ data?: OllamaListedModel[] }>(config.modelsUrl, {
		headers: createDiscoveryHeaders(options.apiKey),
		signal: options.signal,
	});
	const modelIds = Array.isArray(listed.data)
		? listed.data
				.map((entry) => (typeof entry?.id === "string" ? entry.id.trim() : ""))
				.filter(Boolean)
				.sort((left, right) => left.localeCompare(right))
		: [];
	if (modelIds.length === 0) {
		return null;
	}

	const discovered = await mapConcurrent(modelIds, MAX_DISCOVERY_CONCURRENCY, async (id) => {
		const payload = await fetchJson<OllamaShowResponse>(config.showUrl, {
			method: "POST",
			headers: createDiscoveryHeaders(options.apiKey),
			body: JSON.stringify({ model: id, verbose: true }),
			signal: options.signal,
		}).catch(() => null);
		return normalizeDiscoveredModel(id, payload, options.source, options.fallbackModels ?? []);
	});
	const models = discovered.filter((model): model is OllamaProviderModel => model !== null);
	return models.length > 0 ? models : null;
}

function sanitizeStoredModels(models: readonly OllamaProviderModel[]): OllamaProviderModel[] {
	return models.map((model) => toOllamaModel(model));
}

function cloneModel(model: OllamaProviderModel): OllamaProviderModel {
	return {
		...model,
		input: [...model.input],
		cost: { ...model.cost },
		compat: model.compat ? { ...model.compat } : undefined,
	};
}

function normalizeDiscoveredModel(
	id: string,
	payload: OllamaShowResponse | null,
	source: OllamaModelSource,
	fallbackModels: readonly OllamaProviderModel[],
): OllamaProviderModel | null {
	const fallback = fallbackModels.find((model) => model.id === id);
	if (!payload) {
		return fallback ? cloneModel(fallback) : toOllamaModel({ id, source });
	}
	const capabilities = Array.isArray(payload.capabilities)
		? payload.capabilities.filter((capability): capability is string => typeof capability === "string")
		: [];
	const capabilitySet = new Set(capabilities.map((capability) => capability.toLowerCase()));
	const contextWindow = extractContextWindow(payload.model_info) ?? fallback?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
	return toOllamaModel({
		id,
		source,
		reasoning: capabilitySet.has("thinking") || fallback?.reasoning,
		input: capabilitySet.has("vision") ? ["text", "image"] : (fallback?.input ?? ["text"]),
		contextWindow,
		maxTokens: fallback?.maxTokens ?? inferMaxTokens(contextWindow),
	});
}

function extractContextWindow(modelInfo: Record<string, unknown> | undefined): number | null {
	if (!modelInfo) {
		return null;
	}
	for (const [key, value] of Object.entries(modelInfo)) {
		if (!key.endsWith(".context_length")) {
			continue;
		}
		const parsed = typeof value === "number" ? value : Number(value);
		if (Number.isFinite(parsed) && parsed > 0) {
			return Math.floor(parsed);
		}
	}
	return null;
}

function sanitizeInput(input: OllamaProviderModel["input"] | undefined): ("text" | "image")[] {
	const next = Array.isArray(input) && input.includes("image") ? (["text", "image"] as const) : (["text"] as const);
	return [...next];
}

function inferMaxTokens(contextWindow: number): number {
	if (contextWindow >= 1_000_000) {
		return 65_536;
	}
	if (contextWindow >= 262_144) {
		return 32_768;
	}
	if (contextWindow >= 160_000) {
		return 20_480;
	}
	return DEFAULT_MAX_TOKENS;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function formatDisplayName(id: string): string {
	return id
		.replace(/[-_]/g, " ")
		.replace(/:/g, " ")
		.replace(/\bglm\b/gi, "GLM")
		.replace(/\bgpt\b/gi, "GPT")
		.replace(/\boss\b/gi, "OSS")
		.replace(/\bvl\b/gi, "VL")
		.replace(/\brnj\b/gi, "RNJ")
		.replace(/\b(\d+)b\b/gi, (_, size: string) => `${size.toUpperCase()}B`)
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => {
			if (/^[A-Z0-9.]+$/.test(part)) {
				return part;
			}
			return `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`;
		})
		.join(" ");
}

function createDiscoveryHeaders(apiKey?: string): Record<string, string> {
	return apiKey
		? {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			}
		: {
				"Content-Type": "application/json",
			};
}

async function fetchJson<T>(
	url: string,
	options: {
		method?: string;
		headers?: Record<string, string>;
		body?: string;
		signal?: AbortSignal;
	} = {},
): Promise<T> {
	const response = await fetch(url, {
		method: options.method ?? (options.body ? "POST" : "GET"),
		headers: options.headers,
		body: options.body,
		signal: options.signal,
	});
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Ollama request failed (${response.status}): ${body || response.statusText}`);
	}
	return (await response.json()) as T;
}

async function mapConcurrent<T, TResult>(
	items: readonly T[],
	limit: number,
	mapper: (item: T) => Promise<TResult>,
): Promise<TResult[]> {
	const results = new Array<TResult>(items.length);
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (nextIndex < items.length) {
			const current = nextIndex++;
			results[current] = await mapper(items[current]!);
		}
	});
	await Promise.all(workers);
	return results;
}

export { OLLAMA_OPENAI_COMPAT };
