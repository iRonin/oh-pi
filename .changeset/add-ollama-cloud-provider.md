---
default: minor
---

- Add the experimental `@ifi/pi-provider-ollama-cloud` package so pi can log in to Ollama Cloud via `/login ollama-cloud`, discover the current cloud model catalog, and expose those models in `/model`.
- Document the new opt-in provider package and include it in release/package verification metadata.