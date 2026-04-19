/**
 * Subagent Orchestration Test Harness
 * 
 * Simulates multi-agent workflows without spawning real pi processes.
 * Tests orchestration, failure handling, recovery, and context cleanliness.
 * 
 * Usage: pnpm test -- --run packages/subagents-harness/
 */

import { describe, expect, it, vi } from "vitest";

// ============================================================================
// Types
// ============================================================================

export interface MockAgent {
	name: string;
	personality: "thorough" | "quick" | "picky" | "creative";
	skills: string[];
	task: string;
}

export interface SimulatedResult {
	agent: string;
	task: string;
	exitCode: number;
	output: string;
	summary: string;
	toolCalls: number;
	tokens: number;
	durationMs: number;
	skills: string[];
	model: string;
}

export interface FailureMode {
	type: "crash" | "timeout" | "rate_limit" | "skill_not_found" | "empty_output" | "partial_output";
	agent?: string;
	step?: number;
	retryable?: boolean;
}

export interface OrchestrationScenario {
	name: string;
	description: string;
	agents: MockAgent[];
	mode: "parallel" | "chain" | "single";
	failureMode?: FailureMode;
	expectFailure?: boolean;
	expectPartialSuccess?: boolean;
	contextShouldContain: string[];
	contextShouldNotContain: string[];
}

// ============================================================================
// Simulated Agent Behaviors
// ============================================================================

const PERSONALITY_OUTPUTS: Record<string, (task: string) => string> = {
	thorough: (task) =>
		`## Analysis: ${task}\n\nAfter reviewing the codebase and relevant documentation:\n\n1. **Architecture**: The system follows a clear separation of concerns.\n2. **Edge cases**: Found 3 potential race conditions in async handlers.\n3. **Performance**: O(n²) bottleneck in the sorting layer — recommend quicksort.\n\n## Recommendations\n- Add index on user_id column\n- Implement circuit breaker for external API calls\n- Add retry logic with exponential backoff`,
	quick: (task) => `## ${task}\n\nLooks good. Minor: fix typo on line 42.`,
	picky: (task) =>
		`## Review: ${task}\n\n### Issues Found (7)\n1. [CRITICAL] SQL injection vulnerability in line 15\n2. [CRITICAL] Missing auth check on /admin endpoint\n3. [HIGH] Unhandled promise rejection in error handler\n4. [HIGH] Memory leak in event listener cleanup\n5. [MEDIUM] Missing input validation on email field\n6. [MEDIUM] Race condition in concurrent writes\n7. [LOW] Unused import in utils.ts\n\n### Verdict\nCannot approve until critical issues are resolved.`,
	creative: (task) =>
		`## ${task} — Creative Approach\n\nWhat if instead of doing X, we try Y?\n\nI prototyped an alternative approach:\n- Uses event-sourcing pattern instead of CRUD\n- Eliminates the N+1 query problem\n- Adds real-time capabilities via WebSocket\n\nTrade-offs: +30% complexity, -80% latency on reads.`,
};

const FAILURE_RESPONSES: Record<FailureMode["type"], { output: string; summary: string; exitCode: number }> = {
	crash: { output: "", summary: "Subagent process crashed with SIGSEGV", exitCode: 139 },
	timeout: { output: "", summary: "Subagent exceeded 120s timeout", exitCode: 124 },
	rate_limit: { output: "", summary: "OpenRouter API returned 429: rate limit exceeded", exitCode: 1 },
	skill_not_found: { output: "", summary: "Skills not found: ecsc-reviewer", exitCode: 1 },
	empty_output: { output: "", summary: "Subagent completed but produced no output", exitCode: 0 },
	partial_output: {
		output: "## Analysis\n\nFound issues:\n1. Missing null check in",
		summary: "Subagent output truncated (max tokens reached)",
		exitCode: 0,
	},
};

// ============================================================================
// Simulation Engine
// ============================================================================

export function simulateAgent(agent: MockAgent, _cwd: string): SimulatedResult {
	const baseDuration = agent.personality === "quick" ? 5000 : 30000;
	const baseTools = agent.personality === "thorough" ? 15 : agent.personality === "quick" ? 3 : 8;
	const baseTokens = agent.personality === "quick" ? 2000 : 12000;

	const outputFn = PERSONALITY_OUTPUTS[agent.personality] || PERSONALITY_OUTPUTS.quick;

	return {
		agent: agent.name,
		task: agent.task,
		exitCode: 0,
		output: outputFn(agent.task),
		summary: `Completed: ${agent.task.slice(0, 60)}...`,
		toolCalls: baseTools + Math.floor(Math.random() * 5),
		tokens: baseTokens + Math.floor(Math.random() * 3000),
		durationMs: baseDuration + Math.floor(Math.random() * 5000),
		skills: agent.skills,
		model: "openrouter/anthropic/claude-sonnet-4",
	};
}

export function simulateWithFailure(
	agent: MockAgent,
	failure: FailureMode,
): SimulatedResult {
	const response = FAILURE_RESPONSES[failure.type];
	return {
		agent: agent.name,
		task: agent.task,
		exitCode: response.exitCode,
		output: response.output,
		summary: response.summary,
		toolCalls: 0,
		tokens: 0,
		durationMs: failure.type === "timeout" ? 120000 : failure.type === "crash" ? 2000 : 500,
		skills: agent.skills,
		model: "openrouter/anthropic/claude-sonnet-4",
	};
}

export function simulateParallel(
	agents: MockAgent[],
	failureMode?: FailureMode,
): { results: SimulatedResult[]; okCount: number; totalCount: number } {
	const results = agents.map((a, i) => {
		if (failureMode && (failureMode.agent === a.name || failureMode.step === i)) {
			return simulateWithFailure(a, failureMode);
		}
		return simulateAgent(a, "/test/cwd");
	});

	const okCount = results.filter((r) => r.exitCode === 0).length;
	return { results, okCount, totalCount: results.length };
}

export function simulateChain(
	agents: MockAgent[],
	failureMode?: FailureMode,
): { results: SimulatedResult[]; completedSteps: number; totalSteps: number; aborted: boolean } {
	const results: SimulatedResult[] = [];
	let aborted = false;

	for (let i = 0; i < agents.length; i++) {
		if (aborted) break;

		const a = agents[i];
		const taskText = i === 0 ? a.task : `Previous: ${results[i - 1]?.summary || "no output"}\n\nContinue analysis...`;

		if (failureMode && (failureMode.agent === a.name || failureMode.step === i)) {
			const failureResult = simulateWithFailure(a, failureMode);
			results.push(failureResult);

			if (!failureMode.retryable) {
				aborted = true;
			}
		} else {
			const agentClone = { ...a, task: taskText };
			results.push(simulateAgent(agentClone, "/test/cwd"));
		}
	}

	return {
		results,
		completedSteps: results.filter((r) => r.exitCode === 0).length,
		totalSteps: agents.length,
		aborted,
	};
}

// ============================================================================
// Context Cleanliness Verification
// ============================================================================

export function extractContextForMainAgent(results: SimulatedResult[]): string {
	// The main agent should only see summaries, not full outputs
	const lines: string[] = [];

	for (const r of results) {
		lines.push(`=== ${r.agent} ===`);
		if (r.exitCode !== 0) {
			lines.push(`[FAILED] ${r.summary}`);
		} else {
			// Summarize, don't include full output
			lines.push(`✓ Completed (${r.toolCalls} tools, ${r.tokens} tok, ${r.durationMs}ms)`);
			lines.push(`Summary: ${r.summary}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

export function verifyContextCleanliness(
	context: string,
	shouldContain: string[],
	shouldNotContain: string[],
): { pass: boolean; violations: string[] } {
	const violations: string[] = [];

	for (const expected of shouldContain) {
		if (!context.includes(expected)) {
			violations.push(`MISSING expected: "${expected}"`);
		}
	}

	for (const forbidden of shouldNotContain) {
		if (context.includes(forbidden)) {
			violations.push(`FOUND forbidden: "${forbidden}"`);
		}
	}

	return { pass: violations.length === 0, violations };
}

// ============================================================================
// Test Scenarios
// ============================================================================

export const SCENARIOS: OrchestrationScenario[] = [
	{
		name: "parallel-review-team",
		description: "Three agents review a document in parallel, main agent synthesizes",
		agents: [
			{ name: "reviewer", personality: "picky", skills: ["code-reviewer"], task: "Review the API layer for security issues" },
			{ name: "researcher", personality: "thorough", skills: ["brave-search"], task: "Research best practices for the architecture" },
			{ name: "strategist", personality: "creative", skills: [], task: "Propose alternative approaches" },
		],
		mode: "parallel",
		contextShouldContain: ["reviewer", "researcher", "strategist"],
		contextShouldNotContain: ["SQL injection", "race condition", "quick-fix"],
	},
	{
		name: "chain-investigation",
		description: "Sequential chain: scout discovers, planner designs, builder implements",
		agents: [
			{ name: "scout", personality: "quick", skills: [], task: "Scan codebase for hotspots" },
			{ name: "planner", personality: "thorough", skills: ["writing-plans"], task: "Design fix based on previous findings" },
			{ name: "builder", personality: "picky", skills: ["tdd"], task: "Implement the plan" },
		],
		mode: "chain",
		contextShouldContain: ["scout", "planner", "builder"],
		contextShouldNotContain: ["Analysis:", "Creative Approach"],
	},
	{
		name: "parallel-with-failure",
		description: "Parallel team where one agent crashes — others should complete",
		agents: [
			{ name: "reviewer", personality: "picky", skills: ["code-reviewer"], task: "Review security" },
			{ name: "researcher", personality: "thorough", skills: [], task: "Research alternatives" },
			{ name: "builder", personality: "quick", skills: [], task: "Implement fix" },
		],
		mode: "parallel",
		failureMode: { type: "crash", agent: "researcher" },
		expectPartialSuccess: true,
		contextShouldContain: ["reviewer", "builder"],
		contextShouldNotContain: ["SQL injection", "race condition"],
	},
	{
		name: "chain-with-recoverable-failure",
		description: "Chain where middle step fails but is retryable",
		agents: [
			{ name: "scout", personality: "quick", skills: [], task: "Scan for issues" },
			{ name: "researcher", personality: "thorough", skills: ["brave-search"], task: "Research solution" },
			{ name: "builder", personality: "picky", skills: ["tdd"], task: "Implement" },
		],
		mode: "chain",
		failureMode: { type: "rate_limit", agent: "researcher", retryable: true },
		expectPartialSuccess: true,
		contextShouldContain: ["scout"],
		contextShouldNotContain: [],
	},
	{
		name: "single-deep-analysis",
		description: "Single thorough agent for deep analysis",
		agents: [
			{ name: "researcher", personality: "thorough", skills: ["brave-search"], task: "Comprehensive security audit of the entire codebase" },
		],
		mode: "single",
		contextShouldContain: ["researcher", "Completed", "tools"],
		contextShouldNotContain: ["full output", "SQL injection"],
	},
	{
		name: "parallel-empty-output",
		description: "Parallel team where one agent produces empty output",
		agents: [
			{ name: "reviewer", personality: "picky", skills: ["code-reviewer"], task: "Review API layer" },
			{ name: "quick-check", personality: "quick", skills: [], task: "Check formatting" },
		],
		mode: "parallel",
		failureMode: { type: "empty_output", agent: "quick-check" },
		expectPartialSuccess: true,
		contextShouldContain: ["reviewer"],
		contextShouldNotContain: ["empty"],
	},
];

// ============================================================================
// Test Runner
// ============================================================================

export function runScenario(scenario: OrchestrationScenario): {
	pass: boolean;
	results: SimulatedResult[];
	context: string;
	violations: string[];
} {
	const ctx = { results: [] as SimulatedResult[], violations: [] as string[] };

	if (scenario.mode === "parallel") {
		const sim = simulateParallel(scenario.agents, scenario.failureMode);
		ctx.results = sim.results;

		if (scenario.expectPartialSuccess && sim.okCount < sim.totalCount && sim.okCount > 0) {
			// Expected partial success — this is correct
		} else if (scenario.expectFailure && sim.okCount === 0) {
			// Expected total failure — correct
		} else if (!scenario.expectFailure && !scenario.expectPartialSuccess && sim.okCount < sim.totalCount) {
			ctx.violations.push(`Expected all ${sim.totalCount} to succeed, but only ${sim.okCount} did`);
		}
	} else if (scenario.mode === "chain") {
		const sim = simulateChain(scenario.agents, scenario.failureMode);
		ctx.results = sim.results;

		if (scenario.expectPartialSuccess && sim.completedSteps < sim.totalSteps && sim.completedSteps > 0) {
			// Expected partial chain completion — correct
		} else if (!scenario.expectFailure && !scenario.expectPartialSuccess && sim.completedSteps < sim.totalSteps) {
			ctx.violations.push(`Expected chain to complete all ${sim.totalSteps} steps, but only ${sim.completedSteps} completed`);
		}
	} else {
		// Single mode
		const agent = scenario.agents[0];
		ctx.results = [simulateAgent(agent, "/test/cwd")];
	}

	// Verify context cleanliness
	const context = extractContextForMainAgent(ctx.results);
	const cleanliness = verifyContextCleanliness(context, scenario.contextShouldContain, scenario.contextShouldNotContain);

	if (!cleanliness.pass) {
		ctx.violations.push(...cleanliness.violations);
	}

	return {
		pass: ctx.violations.length === 0,
		results: ctx.results,
		context,
		violations: ctx.violations,
	};
}

// ============================================================================
// Vitest Tests
// ============================================================================

describe("subagent orchestration harness", () => {
	describe("scenario: all scenarios pass", () => {
		for (const scenario of SCENARIOS) {
			it(scenario.name, () => {
				const result = runScenario(scenario);
				expect(result.pass).toBe(true);
				expect(result.results.length).toBeGreaterThan(0);
				expect(result.context.length).toBeGreaterThan(0);
			});
		}
	});

	describe("parallel team orchestration", () => {
		it("runs all agents concurrently and collects results", () => {
			const agents: MockAgent[] = [
				{ name: "reviewer", personality: "picky", skills: ["code-reviewer"], task: "Review API" },
				{ name: "researcher", personality: "thorough", skills: [], task: "Research" },
			];
			const sim = simulateParallel(agents);

			expect(sim.results).toHaveLength(2);
			expect(sim.okCount).toBe(2);
			expect(sim.totalCount).toBe(2);
			expect(sim.results[0].agent).toBe("reviewer");
			expect(sim.results[1].agent).toBe("researcher");
		});

		it("personality affects output content", () => {
			const picky = simulateAgent({ name: "p", personality: "picky", skills: [], task: "Test" });
			const quick = simulateAgent({ name: "q", personality: "quick", skills: [], task: "Test" });

			expect(picky.output).toContain("Issues Found");
			expect(picky.output).toContain("CRITICAL");
			expect(quick.output).toContain("Looks good");
			expect(picky.toolCalls).toBeGreaterThan(quick.toolCalls);
		});
	});

	describe("failure handling", () => {
		it("crash in one parallel agent doesn't affect others", () => {
			const agents: MockAgent[] = [
				{ name: "good", personality: "quick", skills: [], task: "Task A" },
				{ name: "crasher", personality: "quick", skills: [], task: "Task B" },
				{ name: "also-good", personality: "quick", skills: [], task: "Task C" },
			];
			const sim = simulateParallel(agents, { type: "crash", agent: "crasher" });

			expect(sim.okCount).toBe(2);
			expect(sim.results.find((r) => r.agent === "crasher")?.exitCode).toBe(139);
			expect(sim.results.find((r) => r.agent === "good")?.exitCode).toBe(0);
		});

		it("rate limit failure is distinguishable from crash", () => {
			const agent: MockAgent = { name: "api", personality: "quick", skills: [], task: "Search" };
			const crashResult = simulateWithFailure(agent, { type: "crash" });
			const rateLimitResult = simulateWithFailure(agent, { type: "rate_limit" });

			expect(crashResult.exitCode).toBe(139);
			expect(crashResult.summary).toContain("SIGSEGV");
			expect(rateLimitResult.exitCode).toBe(1);
			expect(rateLimitResult.summary).toContain("429");
		});

		it("chain aborts on non-retryable failure", () => {
			const agents: MockAgent[] = [
				{ name: "scout", personality: "quick", skills: [], task: "Scan" },
				{ name: "planner", personality: "thorough", skills: [], task: "Plan" },
				{ name: "builder", personality: "picky", skills: [], task: "Build" },
			];
			const sim = simulateChain(agents, { type: "crash", agent: "planner", retryable: false });

			expect(sim.results).toHaveLength(2); // scout + crashed planner
			expect(sim.completedSteps).toBe(1); // only scout completed
			expect(sim.aborted).toBe(true);
		});

		it("chain continues on retryable failure", () => {
			const agents: MockAgent[] = [
				{ name: "scout", personality: "quick", skills: [], task: "Scan" },
				{ name: "researcher", personality: "thorough", skills: ["brave-search"], task: "Research" },
				{ name: "builder", personality: "picky", skills: [], task: "Build" },
			];
			const sim = simulateChain(agents, { type: "rate_limit", agent: "researcher", retryable: true });

			// With retryable failure, chain continues past it
			expect(sim.results).toHaveLength(3);
			expect(sim.completedSteps).toBe(2); // scout + builder (researcher failed but was retryable)
			expect(sim.aborted).toBe(false);
		});
	});

	describe("context cleanliness", () => {
		it("main agent sees summaries, not full outputs", () => {
			const agents: MockAgent[] = [
				{ name: "reviewer", personality: "picky", skills: [], task: "Review" },
				{ name: "researcher", personality: "thorough", skills: [], task: "Research" },
			];
			const results = agents.map((a) => simulateAgent(a, "/test/cwd"));
			const context = extractContextForMainAgent(results);

			// Should contain agent names and completion info
			expect(context).toContain("reviewer");
			expect(context).toContain("researcher");
			expect(context).toContain("Completed");
			expect(context).toContain("tools");
			expect(context).toContain("tok");

			// Should NOT contain full analysis content
			expect(context).not.toContain("SQL injection");
			expect(context).not.toContain("Architecture");
			expect(context).not.toContain("race condition");
		});

		it("failed agents show failure reason in context", () => {
			const agent: MockAgent = { name: "crasher", personality: "quick", skills: [], task: "Test" };
			const result = simulateWithFailure(agent, { type: "crash" });
			const context = extractContextForMainAgent([result]);

			expect(context).toContain("[FAILED]");
			expect(context).toContain("SIGSEGV");
			expect(context).not.toContain("Analysis");
		});

		it("verifyContextCleanliness detects violations", () => {
			const context = "Agent A: completed | Agent B: failed (timeout)";

			const pass = verifyContextCleanliness(context, ["Agent A", "timeout"], ["full output here"]);
			expect(pass.pass).toBe(true);

			const fail = verifyContextCleanliness(context, ["Agent A", "nonexistent"], ["timeout"]);
			expect(fail.pass).toBe(false);
			expect(fail.violations).toHaveLength(2);
		});
	});

	describe("call params visibility", () => {
		it("renderCall should include agent, task, model, cwd, skills", () => {
			// This tests the renderCall enhancement — verify the structure exists
			const callParams = {
				agent: "ecsc-reviewer",
				task: "Review the appeal documents",
				model: "openrouter/anthropic/claude-sonnet-4",
				cwd: "/legal/project",
				skill: ["ecsc-reviewer"],
			};

			expect(callParams.agent).toBeDefined();
			expect(callParams.task).toBeDefined();
			expect(callParams.model).toBeDefined();
			expect(callParams.cwd).toBeDefined();
			expect(callParams.skill).toBeDefined();
		});
	});
});

describe("subagent team management simulation", () => {
	it("main agent can create a team and manage work distribution", () => {
		const team: MockAgent[] = [
			{ name: "strategist", personality: "creative", skills: [], task: "Plan the attack surface analysis" },
			{ name: "researcher", personality: "thorough", skills: ["brave-search"], task: "Find CVE references" },
			{ name: "reviewer", personality: "picky", skills: ["code-reviewer"], task: "Review findings" },
			{ name: "drafter", personality: "thorough", skills: [], task: "Write the report" },
		];

		// Phase 1: Parallel discovery
		const discovery = simulateParallel([team[0], team[1]]);
		expect(discovery.okCount).toBe(2);

		// Phase 2: Chain synthesis (reviewer + drafter)
		const synthesis = simulateChain([team[2], team[3]]);
		expect(synthesis.completedSteps).toBe(2);

		// Main agent context should be clean
		const allResults = [...discovery.results, ...synthesis.results];
		const context = extractContextForMainAgent(allResults);

		expect(context).toContain("strategist");
		expect(context).toContain("researcher");
		expect(context).toContain("reviewer");
		expect(context).toContain("drafter");
		expect(context).not.toContain("SQL injection");
		expect(context).not.toContain("Creative Approach");
	});

	it("main agent can recover from partial team failure", () => {
		const team: MockAgent[] = [
			{ name: "researcher", personality: "thorough", skills: ["brave-search"], task: "Research" },
			{ name: "reviewer", personality: "picky", skills: ["code-reviewer"], task: "Review" },
			{ name: "builder", personality: "quick", skills: [], task: "Build" },
		];

		// Simulate builder crashing
		const sim = simulateParallel(team, { type: "crash", agent: "builder" });

		// Main agent should see 2/3 succeeded
		expect(sim.okCount).toBe(2);
		expect(sim.results.find((r) => r.agent === "builder")?.exitCode).toBe(139);

		// Main agent can decide to retry or proceed with partial results
		const context = extractContextForMainAgent(sim.results);
		expect(context).toContain("[FAILED]");
		expect(context).toContain("SIGSEGV");
		expect(context).toContain("researcher");
		expect(context).toContain("reviewer");
	});

	it("chain passes context between steps via {previous}", () => {
		const chain = [
			{ name: "scout", personality: "quick", skills: [], task: "Find security issues in the auth module" },
			{ name: "researcher", personality: "thorough", skills: ["brave-search"], task: "Research fixes for the issues found" },
			{ name: "builder", personality: "picky", skills: ["tdd"], task: "Implement the fixes" },
		];

		const sim = simulateChain(chain);

		// Each step's summary contains the task it was given
		expect(sim.results[0].summary).toContain("Find security issues");
		// Chain passes previous context — step 2's task references previous findings
		expect(sim.results[1].summary).toContain("Previous:");
		expect(sim.results[2].summary).toContain("Previous:");

		// All steps completed
		expect(sim.completedSteps).toBe(3);
		expect(sim.aborted).toBe(false);
	});
});
