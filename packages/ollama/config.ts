const DEFAULT_OLLAMA_CLOUD_ORIGIN = "https://ollama.com";
const DEFAULT_OLLAMA_CLOUD_API_PATH = "/v1";
const DEFAULT_OLLAMA_CLOUD_KEYS_PATH = "/settings/keys";
const DEFAULT_OLLAMA_CLOUD_SHOW_PATH = "/api/show";
const DEFAULT_OLLAMA_CLOUD_MODELS_PATH = "/models";

function getEnv(name: string): string | undefined {
	const value = process.env[name];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stripTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function normalizeApiUrl(value: string): string {
	return stripTrailingSlash(value);
}

function deriveOriginFromApiUrl(apiUrl: string): string {
	try {
		const url = new URL(apiUrl);
		url.pathname = "";
		url.search = "";
		url.hash = "";
		return stripTrailingSlash(url.toString());
	} catch {
		return DEFAULT_OLLAMA_CLOUD_ORIGIN;
	}
}

export function getOllamaCloudRuntimeConfig(): {
	origin: string;
	apiUrl: string;
	keysUrl: string;
	showUrl: string;
	modelsUrl: string;
} {
	const configuredApiUrl = getEnv("PI_OLLAMA_CLOUD_API_URL") ?? getEnv("OLLAMA_CLOUD_API_URL");
	const apiUrl = normalizeApiUrl(configuredApiUrl ?? `${DEFAULT_OLLAMA_CLOUD_ORIGIN}${DEFAULT_OLLAMA_CLOUD_API_PATH}`);
	const origin =
		stripTrailingSlash(getEnv("PI_OLLAMA_CLOUD_ORIGIN") ?? getEnv("OLLAMA_CLOUD_ORIGIN") ?? deriveOriginFromApiUrl(apiUrl));
	const keysUrl = stripTrailingSlash(
		getEnv("PI_OLLAMA_CLOUD_KEYS_URL") ?? getEnv("OLLAMA_CLOUD_KEYS_URL") ?? `${origin}${DEFAULT_OLLAMA_CLOUD_KEYS_PATH}`,
	);
	const showUrl = stripTrailingSlash(
		getEnv("PI_OLLAMA_CLOUD_SHOW_URL") ?? getEnv("OLLAMA_CLOUD_SHOW_URL") ?? `${origin}${DEFAULT_OLLAMA_CLOUD_SHOW_PATH}`,
	);
	const modelsUrl = stripTrailingSlash(
		getEnv("PI_OLLAMA_CLOUD_MODELS_URL") ?? getEnv("OLLAMA_CLOUD_MODELS_URL") ?? `${apiUrl}${DEFAULT_OLLAMA_CLOUD_MODELS_PATH}`,
	);
	return { origin, apiUrl, keysUrl, showUrl, modelsUrl };
}

export const OLLAMA_CLOUD_PROVIDER = "ollama-cloud";
export const OLLAMA_CLOUD_API = "openai-completions" as const;
export const OLLAMA_CLOUD_API_KEY_ENV = "OLLAMA_API_KEY";
export const OLLAMA_CLOUD_AUTH_DOCS_URL = "https://docs.ollama.com/api/authentication";
export const OLLAMA_CLOUD_LIST_DOCS_URL = "https://docs.ollama.com/api/tags";
