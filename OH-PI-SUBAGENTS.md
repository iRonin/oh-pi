# OH-PI Subagents — Project Status

## Goal

Make the oh-pi subagent system reliable, observable, and controllable for **multi-agent legal document workflows**.

The user manages 17 project-specific ECSC agents (reviewer, strategist, drafter, etc.) that must:
- Work in parallel teams with different personalities and skill sets
- Pass context between chain steps via `{previous}`
- Fail gracefully without killing the whole pipeline
- Keep the main agent's context clean of grunt work (only summaries, not full outputs)
- Use the session's active model (kilocode/qwen3.6-plus), not get routed to random providers

## Fork

| | |
|---|---|
| **Upstream** | `ifiokjr/oh-pi` (owner: Ifiok Jr) |
| **My fork** | `iRonin/oh-pi` |
| **Integration branch** | `ironin-release` — all fixes merged, 1387 tests pass |
| **Local path** | `~/Work/Pi-Agent/oh-pi` |
| **Loaded by pi** | `../../Work/Pi-Agent/oh-pi/packages/subagents` in `~/.pi/agent/settings.json` |

## Open PRs (upstream — `ifiokjr/oh-pi`)

| # | Branch | What | Status | Notes |
|---|---|---|---|---|
| #202 | `fix/subagent-cwd-skill-resolution` | Skills resolve against task `cwd`, not runtime `cwd` | Open | Fixes `--no-skills` bug when subagent has different cwd. Test coverage fix pushed. |
| #205 | `fix/subagent-inherit-session-model` | Subagents inherit session's active model before falling back to adaptive router | Open | Prevents model switch from kilocode → openrouter. Test coverage fix pushed. |
| #207 | `feat/cascading-agents` | Discover agents from all ancestor directories (nearest wins) | Open | Enables project agents from nested subdirs. 276 lines. |

**Not ours (other open PRs):** #197 (Mistral API), #173 (BTW overlay), #107 (watchdog Bun compat — needs lint fix, maintainer gave guidance).

## What's in `ironin-release` (beyond the 3 PRs)

| Commit | What |
|---|---|
| `b342515` | **Explicit agent paths** — `.pi/settings.json` `"agents": [".pi/agents"]` disables auto-discovery, loads ONLY listed dirs (no builtins, no user agents) |
| `738ec63` | Fix: agent paths resolve relative to project root, not `.pi` dir |
| `42b754e` | **Verbose call params** — `renderCall` shows agent, task preview, model, cwd, skills; `renderResult` shows call params; collapsible JSON block injected into result content |
| `db59bb1` | Debug logging for model/skill resolution (behind `PI_SUBAGENTS_DEBUG=1`) |
| `a14cb31` | **Subagent harness** — test framework for simulating multi-agent orchestration, failure modes, recovery, context cleanliness |

## Key Technical Decisions

1. **Explicit agent control** — `.pi/settings.json` `agents` array overrides cascading discovery. Gives per-project strict control over what agents are available.
2. **Context cleanliness** — Main agent sees summaries only (`extractContextForMainAgent`), not full subagent outputs. Full output goes to files, not context.
3. **Model inheritance** — Session model (priority 3) sits between frontmatter model (priority 2) and adaptive router (priority 4).
4. **CWD-aware skill resolution** — Skills resolve against task `cwd ?? chainCwd ?? runtimeCwd`, not just runtime cwd.
5. **Call params in results** — Every sync result includes `callParams` in details for TUI observability.

## Local Setup

```bash
# Fork is on ironin-release branch
cd ~/Work/Pi-Agent/oh-pi && git checkout ironin-release

# Tests
pnpm test  # 1387 tests pass

# After npm update, restart pi — extension loads TS source directly
```

## Next Steps

1. **Await upstream PR review** — #202, #205, #207 need maintainer review/merge
2. **Integration testing** — wire harness to real subagent execution with mock LLM responses
3. **Agent instruction** — teach ECSC agents to use harness for team orchestration patterns
4. **Recovery patterns** — retry logic, fallback agents, escalation chains

## Relevant Files

```
packages/subagents/
  index.ts           # Main extension — tool definition, renderCall, renderResult
  agents.ts          # Agent discovery (explicit paths + cascading)
  execution.ts       # Sync execution (runSync)
  async-execution.ts # Async execution (executeAsyncSingle, executeAsyncChain)
  model-routing.ts   # Model resolution with session fallback
  render.ts          # TUI rendering for tool call and result
  types.ts           # Details interface with callParams field

packages/subagents-harness/
  tests/harness.test.ts  # Orchestration simulation + failure mode tests
```
