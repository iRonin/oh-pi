# @ifi/pi-provider-ollama

Experimental Ollama provider package for pi with both local and cloud support.

## What it does

- Registers a local `ollama` provider via `pi.registerProvider(...)`
- Auto-discovers installed local Ollama models from the running daemon
- Adds `/login ollama-cloud` support using an Ollama API key flow
- Discovers the current Ollama Cloud model catalog and stores it with the login credential
- Exposes local models in `/model` as `ollama/<model-id>`
- Exposes cloud models in `/model` as `ollama-cloud/<model-id>`
- Adds `/ollama status|refresh-models|info` for a unified local + cloud workflow

## Install

```bash
pi install npm:@ifi/pi-provider-ollama
```

This package is intentionally separate from `@ifi/oh-pi` for now.

## Use

### Local Ollama

1. Install the package
2. Start Ollama locally
3. Open `/model` and select an `ollama/...` model
4. Run `/ollama refresh-models` whenever you pull or remove local models

### Ollama Cloud

1. Install the package
2. Run `/login ollama-cloud`
3. Create an API key on Ollama when pi opens the keys page
4. Paste the key back into pi
5. Open `/model` and select an `ollama-cloud/...` model
6. Optionally run `/ollama refresh-models` later to refresh both local and cloud catalogs

## Commands

- `/ollama status` — show local daemon status and cloud auth/catalog status
- `/ollama refresh-models` — refresh both local and cloud Ollama models
- `/ollama info <model>` — show known metadata for a local or cloud Ollama model
- `/ollama-cloud status` — backward-compatible cloud-only status alias
- `/ollama-cloud refresh-models` — backward-compatible cloud-only refresh alias

## Notes

- Local Ollama uses the daemon's OpenAI-compatible `/v1` API plus `/api/show` metadata.
- Cloud Ollama uses Ollama's documented API-key flow for third-party access.
- Local model discovery is dynamic and installation-specific, so there is no static local fallback catalog.
- Cloud model discovery falls back to a bundled cloud catalog when live discovery is unavailable.
- Costs are currently left at zero because Ollama does not expose stable per-token pricing for local or cloud use in a way that pi can rely on here.

## Test hooks

These environment variables exist mainly for tests and local debugging:

### Local

- `PI_OLLAMA_LOCAL_API_URL`
- `PI_OLLAMA_LOCAL_MODELS_URL`
- `PI_OLLAMA_LOCAL_SHOW_URL`
- `PI_OLLAMA_LOCAL_ORIGIN`
- `OLLAMA_HOST`

### Cloud

- `PI_OLLAMA_CLOUD_API_URL`
- `PI_OLLAMA_CLOUD_MODELS_URL`
- `PI_OLLAMA_CLOUD_SHOW_URL`
- `PI_OLLAMA_CLOUD_KEYS_URL`
- `PI_OLLAMA_CLOUD_ORIGIN`
- `OLLAMA_HOST_CLOUD`
- `OLLAMA_API_KEY`

Legacy `OLLAMA_CLOUD_*` env names are also accepted for cloud compatibility with earlier iterations of this package.
