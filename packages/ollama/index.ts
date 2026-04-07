import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	createOllamaCloudOAuthProvider,
	loginOllamaCloud,
	refreshOllamaCloudCredential,
	refreshOllamaCloudCredentialModels,
} from "./auth.js";
import {
	OLLAMA_API,
	OLLAMA_CLOUD_API_KEY_ENV,
	OLLAMA_CLOUD_PROVIDER,
	OLLAMA_LOCAL_API_KEY_LITERAL,
	OLLAMA_LOCAL_PROVIDER,
	getOllamaCloudRuntimeConfig,
	getOllamaLocalRuntimeConfig,
} from "./config.js";
import {
	discoverOllamaCloudModels,
	discoverOllamaLocalModels,
	getCredentialModels,
	getFallbackOllamaCloudModels,
	toProviderModels,
	type OllamaCloudCredentials,
	type OllamaProviderModel,
} from "./models.js";

type RuntimeDiscoveryState = {
	models: OllamaProviderModel[];
	lastRefresh: number | null;
	lastError: string | null;
};

const localDiscoveryState: RuntimeDiscoveryState = {
	models: [],
	lastRefresh: null,
	lastError: null,
};

const cloudEnvDiscoveryState: RuntimeDiscoveryState = {
	models: [],
	lastRefresh: null,
	lastError: null,
};

function registerOllamaLocalProvider(pi: ExtensionAPI): void {
	pi.registerProvider(OLLAMA_LOCAL_PROVIDER, {
		api: OLLAMA_API,
		apiKey: OLLAMA_LOCAL_API_KEY_LITERAL,
		baseUrl: getOllamaLocalRuntimeConfig().apiUrl,
		models: toProviderModels(localDiscoveryState.models),
	});
}

function registerOllamaCloudProvider(pi: ExtensionAPI): void {
	pi.registerProvider(OLLAMA_CLOUD_PROVIDER, {
		api: OLLAMA_API,
		apiKey: OLLAMA_CLOUD_API_KEY_ENV,
		baseUrl: getOllamaCloudRuntimeConfig().apiUrl,
		oauth: createOllamaCloudOAuthProvider(),
		models: toProviderModels(cloudEnvDiscoveryState.models),
	});
}

async function refreshRegisteredLocalModels(pi: ExtensionAPI): Promise<OllamaProviderModel[]> {
	try {
		localDiscoveryState.models = (await discoverOllamaLocalModels()) ?? [];
		localDiscoveryState.lastError = null;
	} catch (error) {
		localDiscoveryState.models = [];
		localDiscoveryState.lastError = error instanceof Error ? error.message : String(error);
	}
	localDiscoveryState.lastRefresh = Date.now();
	registerOllamaLocalProvider(pi);
	return localDiscoveryState.models;
}

async function refreshRegisteredCloudEnvModels(pi: ExtensionAPI): Promise<OllamaProviderModel[]> {
	const apiKey = process.env[OLLAMA_CLOUD_API_KEY_ENV]?.trim();
	if (!apiKey) {
		cloudEnvDiscoveryState.models = [];
		cloudEnvDiscoveryState.lastError = null;
		cloudEnvDiscoveryState.lastRefresh = Date.now();
		registerOllamaCloudProvider(pi);
		return cloudEnvDiscoveryState.models;
	}

	try {
		cloudEnvDiscoveryState.models = (await discoverOllamaCloudModels(apiKey)) ?? getFallbackOllamaCloudModels();
		cloudEnvDiscoveryState.lastError = null;
	} catch (error) {
		cloudEnvDiscoveryState.models = getFallbackOllamaCloudModels();
		cloudEnvDiscoveryState.lastError = error instanceof Error ? error.message : String(error);
	}
	cloudEnvDiscoveryState.lastRefresh = Date.now();
	registerOllamaCloudProvider(pi);
	return cloudEnvDiscoveryState.models;
}

function registerOllamaCommands(pi: ExtensionAPI): void {
	pi.registerCommand("ollama", {
		description: "Inspect or refresh local + cloud Ollama providers: /ollama [status|refresh-models|models|info <model>]",
		async handler(args, ctx) {
			const trimmed = args.trim();
			const [rawAction = "status", ...rest] = trimmed ? trimmed.split(/\s+/) : ["status"];
			const action = rawAction.toLowerCase();
			const credential = getStoredCloudCredential(ctx);

			if (action === "refresh-models") {
				const localModels = await refreshRegisteredLocalModels(pi);
						const cloudModels = await refreshCloudModels(pi, ctx, credential);
				ctx.modelRegistry.refresh();
				const cloudStatus = credential || process.env[OLLAMA_CLOUD_API_KEY_ENV]?.trim()
					? `${cloudModels.length} cloud available`
					: "cloud not configured";
				ctx.ui.notify(`Refreshed Ollama models (${localModels.length} local, ${cloudStatus}).`, "info");
				return;
			}

			if (action === "models") {
				ctx.ui.notify(renderModelList(collectOllamaModels(credential)), "info");
				return;
			}

			if (action === "info") {
				const query = rest.join(" ").trim();
				if (!query) {
					ctx.ui.notify("Usage: /ollama info <model>", "warning");
					return;
				}
				const model = findModelForQuery(query, collectOllamaModels(credential));
				if (!model) {
					ctx.ui.notify(`No Ollama model matched \"${query}\". Run /ollama refresh-models first.`, "warning");
					return;
				}
				ctx.ui.notify(renderModelInfo(model), "info");
				return;
			}

			ctx.ui.notify(renderUnifiedStatus(credential), "info");
		},
	});

	pi.registerCommand("ollama-cloud", {
		description: "Backward-compatible alias for cloud-only Ollama status and refresh: /ollama-cloud [status|refresh-models]",
		async handler(args, ctx) {
			const action = args.trim().toLowerCase() || "status";
			const credential = getStoredCloudCredential(ctx);

			if (action === "refresh-models") {
				const cloudModels = await refreshCloudModels(pi, ctx, credential);
				ctx.modelRegistry.refresh();
				if (!credential && !process.env[OLLAMA_CLOUD_API_KEY_ENV]?.trim()) {
					ctx.ui.notify("Ollama Cloud is not configured. Run /login ollama-cloud or set OLLAMA_API_KEY.", "warning");
					return;
				}
				ctx.ui.notify(`Refreshed Ollama Cloud models (${cloudModels.length} available).`, "info");
				return;
			}

			ctx.ui.notify(renderCloudStatus(credential), "info");
		},
	});
}

async function refreshCloudModels(
	pi: ExtensionAPI,
	ctx: { modelRegistry: { authStorage: { set: (provider: string, credential: any) => void } } },
	credential: OllamaCloudCredentials | null,
): Promise<OllamaProviderModel[]> {
	if (credential) {
		const refreshed = credential.expires <= Date.now()
			? await refreshOllamaCloudCredential(credential)
			: await refreshOllamaCloudCredentialModels(credential);
		ctx.modelRegistry.authStorage.set(OLLAMA_CLOUD_PROVIDER, { type: "oauth", ...refreshed });
		return getCredentialModels(refreshed);
	}
	return refreshRegisteredCloudEnvModels(pi);
}

function renderUnifiedStatus(credential: OllamaCloudCredentials | null): string {
	const localConfig = getOllamaLocalRuntimeConfig();
	const cloudConfig = getOllamaCloudRuntimeConfig();
	const localState = localDiscoveryState.lastError
		? `unreachable (${localDiscoveryState.lastError})`
		: localDiscoveryState.lastRefresh
			? "reachable"
			: "probing";
	const localRefresh = formatRefreshAge(localDiscoveryState.lastRefresh);
	const cloudRefresh = formatRefreshAge(credential?.lastModelRefresh ?? cloudEnvDiscoveryState.lastRefresh);
	const cloudModels = credential ? getCredentialModels(credential) : cloudEnvDiscoveryState.models;
	const cloudAuth = credential ? "stored via /login" : process.env[OLLAMA_CLOUD_API_KEY_ENV]?.trim() ? "environment only" : "not configured";
	return [
		`Ollama local: ${localState}`,
		`Local models: ${localDiscoveryState.models.length}${localRefresh}`,
		`Local base URL: ${localConfig.apiUrl}`,
		`Ollama cloud auth: ${cloudAuth}`,
		`Cloud models: ${cloudModels.length}${cloudRefresh}`,
		`Cloud base URL: ${cloudConfig.apiUrl}`,
		`Tip: run /ollama models to compare local and cloud choices.`,
	].join("\n");
}

function renderCloudStatus(credential: OllamaCloudCredentials | null): string {
	const config = getOllamaCloudRuntimeConfig();
	const cloudModels = credential ? getCredentialModels(credential) : cloudEnvDiscoveryState.models;
	const cloudAuth = credential ? "stored via /login" : process.env[OLLAMA_CLOUD_API_KEY_ENV]?.trim() ? "environment only" : "not configured";
	return [
		`Ollama cloud auth: ${cloudAuth}`,
		`Cloud models: ${cloudModels.length}${formatRefreshAge(credential?.lastModelRefresh ?? cloudEnvDiscoveryState.lastRefresh)}`,
		`Cloud base URL: ${config.apiUrl}`,
	].join("\n");
}

function collectOllamaModels(credential: OllamaCloudCredentials | null): Array<OllamaProviderModel & { provider: string; baseUrl: string }> {
	const localConfig = getOllamaLocalRuntimeConfig();
	const cloudConfig = getOllamaCloudRuntimeConfig();
	const cloudModels = credential ? getCredentialModels(credential) : cloudEnvDiscoveryState.models;
	return [
		...localDiscoveryState.models.map((model) => ({ ...model, provider: OLLAMA_LOCAL_PROVIDER, baseUrl: localConfig.apiUrl })),
		...cloudModels.map((model) => ({ ...model, provider: OLLAMA_CLOUD_PROVIDER, baseUrl: cloudConfig.apiUrl })),
	];
}

function findModelForQuery(
	query: string,
	models: Array<OllamaProviderModel & { provider: string; baseUrl: string }>,
): (OllamaProviderModel & { provider: string; baseUrl: string }) | null {
	const normalized = query.trim().toLowerCase();
	if (!normalized) {
		return null;
	}
	return (
		models.find((model) => `${model.provider}/${model.id}`.toLowerCase() === normalized) ??
		models.find((model) => model.id.toLowerCase() === normalized) ??
		models.find((model) => model.name.toLowerCase() === normalized) ??
		models.find((model) => `${model.provider}/${model.id}`.toLowerCase().includes(normalized)) ??
		models.find((model) => model.id.toLowerCase().includes(normalized)) ??
		models.find((model) => model.name.toLowerCase().includes(normalized)) ??
		null
	);
}

function renderModelInfo(model: OllamaProviderModel & { provider: string; baseUrl: string }): string {
	const lines = [
		`${sourceIcon(model.provider)} ${model.provider}/${model.id}`,
		`Name: ${model.name}`,
		`Source: ${model.provider === OLLAMA_LOCAL_PROVIDER ? "Local Ollama daemon" : "Ollama Cloud"}`,
		`Inputs: ${model.input.join(", ")}`,
		`Reasoning: ${model.reasoning ? "yes" : "no"}`,
		`Context window: ${model.contextWindow.toLocaleString()}`,
		`Max tokens: ${model.maxTokens.toLocaleString()}`,
		`Base URL: ${model.baseUrl}`,
	];
	if (model.family) {
		lines.splice(4, 0, `Family: ${model.family}`);
	}
	if (model.parameterSize) {
		lines.splice(5, 0, `Parameter size: ${model.parameterSize}`);
	}
	if (model.quantization) {
		lines.splice(6, 0, `Quantization: ${model.quantization}`);
	}
	const capabilitySummary = summarizeCapabilities(model);
	if (capabilitySummary) {
		lines.splice(lines.length - 1, 0, `Capabilities: ${capabilitySummary}`);
	}
	return lines.join("\n");
}

function renderModelList(models: Array<OllamaProviderModel & { provider: string; baseUrl: string }>): string {
	if (models.length === 0) {
		return "No Ollama models are currently registered. Run /ollama refresh-models.";
	}
	const sections = [
		{
			title: "Local",
			models: models.filter((model) => model.provider === OLLAMA_LOCAL_PROVIDER),
		},
		{
			title: "Cloud",
			models: models.filter((model) => model.provider === OLLAMA_CLOUD_PROVIDER),
		},
	].filter((section) => section.models.length > 0);
	return sections
		.map((section) => [
			`Ollama ${section.title}:`,
			...section.models
				.sort((left, right) => left.id.localeCompare(right.id))
				.map(
					(model) =>
						`  ${sourceIcon(model.provider)} ${model.provider}/${model.id} — ${model.name}${renderModelBadges(model)} · ${model.contextWindow.toLocaleString()} ctx`,
				),
		].join("\n"))
		.join("\n\n");
}

function renderModelBadges(model: OllamaProviderModel): string {
	const badges: string[] = [];
	if (model.input.includes("image")) {
		badges.push("vision");
	}
	if (model.reasoning) {
		badges.push("reasoning");
	}
	if (model.parameterSize) {
		badges.push(model.parameterSize);
	}
	return badges.length > 0 ? ` [${badges.join(" · ")}]` : "";
}

function summarizeCapabilities(model: OllamaProviderModel): string | null {
	const values = new Set<string>();
	for (const capability of model.capabilities ?? []) {
		values.add(capability);
	}
	if (model.input.includes("image")) {
		values.add("vision");
	}
	if (model.reasoning) {
		values.add("thinking");
	}
	return values.size > 0 ? [...values].join(", ") : null;
}

function sourceIcon(provider: string): string {
	return provider === OLLAMA_LOCAL_PROVIDER ? "⌂" : "☁";
}

function formatRefreshAge(timestamp: number | null | undefined): string {
	if (!timestamp) {
		return "";
	}
	const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
	if (seconds < 5) {
		return " (just refreshed)";
	}
	if (seconds < 60) {
		return ` (${seconds}s ago)`;
	}
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) {
		return ` (${minutes}m ago)`;
	}
	const hours = Math.round(minutes / 60);
	return ` (${hours}h ago)`;
}

function getStoredCloudCredential(ctx: { modelRegistry: { authStorage: { get: (provider: string) => unknown } } }): OllamaCloudCredentials | null {
	const credential = ctx.modelRegistry.authStorage.get(OLLAMA_CLOUD_PROVIDER);
	return credential && typeof credential === "object" && (credential as { type?: string }).type === "oauth"
		? (credential as OllamaCloudCredentials)
		: null;
}

function bootstrapOllamaProviders(pi: ExtensionAPI): void {
	registerOllamaLocalProvider(pi);
	registerOllamaCloudProvider(pi);
	void refreshRegisteredLocalModels(pi);
	if (process.env[OLLAMA_CLOUD_API_KEY_ENV]?.trim()) {
		void refreshRegisteredCloudEnvModels(pi);
	}
}

export {
	createOllamaCloudOAuthProvider,
	discoverOllamaCloudModels,
	discoverOllamaLocalModels,
	getCredentialModels,
	getFallbackOllamaCloudModels,
	loginOllamaCloud,
	refreshOllamaCloudCredential,
};
export { toOllamaModel, toOllamaCloudModel, type OllamaCloudCredentials, type OllamaProviderModel } from "./models.js";

export default function ollamaProviderExtension(pi: ExtensionAPI): void {
	bootstrapOllamaProviders(pi);
	registerOllamaCommands(pi);
}
