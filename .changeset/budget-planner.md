---
default: minor
---

### Usage-aware budget planner for ant colony

The ant colony now queries the usage-tracker extension for real-time provider rate limits
(Claude session/weekly %, Codex 5h/weekly %) and session cost data to intelligently allocate
resources across scout, worker, and soldier castes.

**New module: `budget-planner.ts`**
- Classifies budget severity (comfortable → moderate → tight → critical) from rate limits and cost
- Allocates per-caste budgets: scouts 10%, workers 70%, soldiers 20%, drones free
- Caps concurrency based on severity (critical=1, tight=2, moderate=3, comfortable=6)
- Reduces per-ant turn counts when budget is constrained
- Generates budget-awareness prompt sections injected into ant system prompts

**Usage-tracker event broadcasting**
- `usage:limits` event broadcast after each turn with rate limit windows, session cost, per-model data
- `usage:query` event listener responds with current data for on-demand queries
- Other extensions can listen to `usage:limits` for dashboard/alerting

**Integration points**
- Queen refreshes budget plan before each phase (scouting, working, reviewing)
- Adaptive concurrency controller respects budget-plan caps
- Ant prompts include budget awareness when severity is moderate or worse
- 66 tests for budget planner, 6 tests for event broadcasting (325 total)

### Fixed: usage-tracker shortcut conflict

`Ctrl+U` is kept as the usage dashboard shortcut. The extension now auto-configures
`~/.pi/agent/keybindings.json` on first load to unbind `deleteToLineStart` from `ctrl+u`,
eliminating the conflict warning without requiring manual user configuration.
