---
default: minor
---

### Support multiple concurrent colonies

The ant colony extension now supports running multiple colonies simultaneously.
Each colony gets a short ID (`c1`, `c2`, ...) shown in all status output, signals,
and the details panel.

**New commands:**
- `/colony-count` — shows how many colonies are active with their IDs and goals

**Updated commands:**
- `/colony <goal>` — launches a new colony (no longer blocked by existing ones)
- `/colony-status [id]` — shows one colony by ID, or all if no ID given (with autocomplete)
- `/colony-stop [id|all]` — stops a specific colony by ID, or all if no ID / `all` given (with autocomplete)
- `/colony-resume [colonyId]` — resumes a specific persisted colony, or the most recent one
- `ant_colony` tool — no longer rejects when a colony is already running

**Details panel (Ctrl+Shift+A):**
- Colony selector header when multiple are running
- Press `n` to cycle between colonies

**Backwards compatible:**
- Existing `.ant-colony/` directories on disk are unmodified — `findResumable` still works
- Single-colony usage is unchanged (commands auto-resolve when only one colony exists)
- New `Nest.findAllResumable()` method finds all resumable colonies sorted by creation date
