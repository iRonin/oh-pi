import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	createOllamaCloudOAuthProvider,
	refreshOllamaCloudCredential,
	refreshOllamaCloudCredentialModels,
} from "./auth.js";
import { OLLAMA_CLOUD_API, OLLAMA_CLOUD_PROVIDER, getOllamaCloudRuntimeConfig } from "./config.js";
import { getCredentialModels, getFallbackOllamaCloudModels, toProviderModels, type OllamaCloudCredentials } from "./models.js";

function registerOllamaCloudProvider(pi: ExtensionAPI): void {
	pi.registerProvider(OLLAMA_CLOUD_PROVIDER, {
		api: OLLAMA_CLOUD_API,
		apiKey: "OLLAMA_API_KEY",
		baseUrl: getOllamaCloudRuntimeConfig().apiUrl,
		oauth: createOllamaCloudOAuthProvider(),
		models: toProviderModels(getFallbackOllamaCloudModels()),
	});
}

function registerOllamaCloudCommand(pi: ExtensionAPI): void {
	pi.registerCommand("ollama-cloud", {
		description: "Inspect or refresh the Ollama Cloud provider: /ollama-cloud [status|refresh-models]",
		async handler(args, ctx) {
			const action = args.trim().toLowerCase() || "status";
			const authStorage = ctx.modelRegistry.authStorage;
			const credential = authStorage.get(OLLAMA_CLOUD_PROVIDER);
			const envConfigured = Boolean(process.env.OLLAMA_API_KEY?.trim());

			if (action === "refresh-models") {
				if (!credential || credential.type !== "oauth") {
					ctx.ui.notify(
						envConfigured
							? "OLLAMA_API_KEY is set in the environment, but there is no persisted Ollama Cloud login to refresh. Run /login ollama-cloud to store a reusable credential."
							: "Not logged in to Ollama Cloud. Run /login ollama-cloud first.",
						"warning",
					);
					return;
				}

				const refreshed = credential.expires <= Date.now()
					? await refreshOllamaCloudCredential(credential)
					: await refreshOllamaCloudCredentialModels(credential as OllamaCloudCredentials);
				authStorage.set(OLLAMA_CLOUD_PROVIDER, { type: "oauth", ...refreshed });
				ctx.modelRegistry.refresh();
				ctx.ui.notify(`Refreshed Ollama Cloud models (${getCredentialModels(refreshed).length} available).`, "info");
				return;
			}

			const models = credential && credential.type === "oauth" ? getCredentialModels(credential as OllamaCloudCredentials) : [];
			const authSource = credential?.type === "oauth" ? "stored via /login" : envConfigured ? "environment only" : "not configured";
			ctx.ui.notify(
				[
					`Ollama Cloud auth: ${authSource}`,
					`Discovered models: ${models.length}`,
					`Base URL: ${getOllamaCloudRuntimeConfig().apiUrl}`,
				].join("\n"),
				"info",
			);
		},
	});
}

export { createOllamaCloudOAuthProvider, loginOllamaCloud, refreshOllamaCloudCredential } from "./auth.js";
export {
	discoverOllamaCloudModels,
	getCredentialModels,
	getFallbackOllamaCloudModels,
	toOllamaCloudModel,
	type OllamaCloudCredentials,
	type OllamaCloudProviderModel,
} from "./models.js";

export default function ollamaCloudProviderExtension(pi: ExtensionAPI): void {
	registerOllamaCloudProvider(pi);
	registerOllamaCloudCommand(pi);
}
