# @ifi/pi-provider-ollama-cloud

Experimental Ollama Cloud provider for pi.

## What it does

- Registers an `ollama-cloud` provider via `pi.registerProvider(...)`
- Adds `/login ollama-cloud` support using an Ollama API key flow
- Discovers the current Ollama Cloud model catalog and stores it with the login credential
- Exposes discovered models in `/model` as `ollama-cloud/<model-id>`
- Adds `/ollama-cloud refresh-models` to refresh the catalog on demand

## Install

```bash
pi install npm:@ifi/pi-provider-ollama-cloud
```

This package is intentionally separate from `@ifi/oh-pi` for now.

## Use

1. Install the package
2. Run `/login ollama-cloud`
3. Create an API key on Ollama when pi opens the keys page
4. Paste the key back into pi
5. Open `/model` and select an `ollama-cloud/...` model
6. Optionally run `/ollama-cloud refresh-models` later to refresh the catalog

## Commands

- `/ollama-cloud status` — show auth and catalog status
- `/ollama-cloud refresh-models` — rediscover available Ollama Cloud models and refresh the provider registry

## Notes

- This integration is **cloud-only** for now. It does not configure local Ollama models.
- pi uses Ollama's documented API-key flow for third-party cloud access.
- Model discovery is stored alongside the login credential so `/login ollama-cloud` can refresh the model list immediately.
- Costs are currently left at zero because Ollama Cloud subscription billing is not exposed as stable per-token pricing in the docs yet.

## Test hooks

These environment variables exist mainly for tests and local debugging:

- `PI_OLLAMA_CLOUD_API_URL`
- `PI_OLLAMA_CLOUD_MODELS_URL`
- `PI_OLLAMA_CLOUD_SHOW_URL`
- `PI_OLLAMA_CLOUD_KEYS_URL`
- `PI_OLLAMA_CLOUD_ORIGIN`

Legacy `OLLAMA_CLOUD_*` env names are also accepted for compatibility with local debugging.
