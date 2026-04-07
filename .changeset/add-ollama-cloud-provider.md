---
default: minor
---

- Add the experimental `@ifi/pi-provider-ollama` package so pi can discover local Ollama models, log in to Ollama Cloud via `/login ollama-cloud`, and expose both local and cloud models in `/model`.
- Add unified `/ollama` commands for refreshing local + cloud model catalogs and inspecting discovered model metadata.
- Extend usage tracking with best-effort Ollama local/cloud status so `/usage` and `usage_report` include Ollama session visibility and any rate-limit headers Ollama exposes.