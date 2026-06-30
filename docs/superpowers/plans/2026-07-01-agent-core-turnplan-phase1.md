# Agent Core TurnPlan Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first `TurnPlan` implementation that centralizes current intent/risk/tool/verification decisions without changing visible agent behavior.

**Architecture:** Phase 1 wraps existing `AgentTurnState`, tool bundle, skill, and recovery logic in a typed `TurnPlan`. Existing tool ids, prompts, and chat modes remain unchanged; downstream code can start consuming `TurnPlan` metadata and selection fields.

**Tech Stack:** TypeScript, Node test runner via `tsx --test`, existing `agent-gui` Vercel AI SDK runtime.

---

## File Structure

- Create `agent-gui/lib/agent-core/turn-plan.ts`: `TurnPlan` types, target extraction, verification policy, and resolver.
- Create `agent-gui/lib/agent-core/turn-plan.test.ts`: red/green tests for current behavior.
- Modify `agent-gui/lib/agent-runtime-snapshot.ts`: include `turnPlan` while preserving `turnState`.
- Modify `agent-gui/lib/chat-tool-selection.ts`: resolve bundle/full-schema decisions from `TurnPlan`.
- Modify `agent-gui/lib/agent-harness/run-turn.server.ts`: compute one plan per turn and pass it to tool selection and runtime snapshot.

### Task 1: Add TurnPlan Resolver

**Files:**
- Create: `agent-gui/lib/agent-core/turn-plan.ts`
- Test: `agent-gui/lib/agent-core/turn-plan.test.ts`

- [x] **Step 1: Write failing tests**

Create tests that assert:
- authoring prompts select `quicker_authoring`, write risk, qkrpc authoring bundles, and diagnostics verification.
- ask mode forces read risk and explain-only verification.
- launcher mode maps to `quicker_runtime`.
- required recovery `nextAction` is surfaced in `requiredToolIds`.

- [x] **Step 2: Run tests and verify failure**

Run: `pnpm exec tsx --test lib/agent-core/turn-plan.test.ts`
Expected: FAIL because `lib/agent-core/turn-plan.ts` does not exist.

- [x] **Step 3: Implement minimal resolver**

Implement `resolveTurnPlan()` by reusing `buildAgentTurnState()`, `resolveActiveToolBundles()`, `resolveFullSchemaToolIds()`, and `chooseRecoveryDecision()`.

- [x] **Step 4: Run tests and verify pass**

Run: `pnpm exec tsx --test lib/agent-core/turn-plan.test.ts`
Expected: PASS.

### Task 2: Wire Runtime Snapshot

**Files:**
- Modify: `agent-gui/lib/agent-runtime-snapshot.ts`
- Test: `agent-gui/lib/agent-runtime-snapshot.test.ts`

- [x] **Step 1: Write failing test**

Add a test that `buildAgentRuntimeSnapshot()` exposes `turnPlan.intent` and keeps `turnState.intent` unchanged.

- [x] **Step 2: Run test and verify failure**

Run: `pnpm exec tsx --test lib/agent-runtime-snapshot.test.ts`
Expected: FAIL because snapshot has no `turnPlan`.

- [x] **Step 3: Implement snapshot wiring**

Call `resolveTurnPlan()` inside `buildAgentRuntimeSnapshot()` and include the result.

- [x] **Step 4: Run test and verify pass**

Run: `pnpm exec tsx --test lib/agent-runtime-snapshot.test.ts lib/agent-core/turn-plan.test.ts`
Expected: PASS.

### Task 3: Use TurnPlan for Tool Schema Selection

**Files:**
- Modify: `agent-gui/lib/chat-tool-selection.ts`
- Test: `agent-gui/lib/chat-tool-selection.test.ts`

- [x] **Step 1: Write failing test**

Add a test that `resolveToolBundleContext()` returns `turnPlan` and that authoring context full-schema tool ids match the plan.

- [x] **Step 2: Run test and verify failure**

Run: `pnpm exec tsx --test lib/chat-tool-selection.test.ts`
Expected: FAIL because `resolveToolBundleContext()` has no `turnPlan`.

- [x] **Step 3: Implement selection wiring**

Use `resolveTurnPlan()` inside `resolveToolBundleContext()` and derive `activeBundles` / `fullSchemaToolIds` from the plan.

- [x] **Step 4: Run focused tests**

Run: `pnpm exec tsx --test lib/chat-tool-selection.test.ts lib/agent-core/turn-plan.test.ts`
Expected: PASS.

### Task 4: Pass TurnPlan Through Chat Turn

**Files:**
- Modify: `agent-gui/lib/agent-harness/run-turn.server.ts`
- Test: existing tests through focused suites.

- [x] **Step 1: Minimal implementation**

Compute a preliminary `TurnPlan` before selecting tools, use its `fullSchemaToolIds`, and compute the runtime snapshot from the same plan.

- [x] **Step 2: Run focused suites**

Run: `pnpm exec tsx --test lib/agent-core/turn-plan.test.ts lib/agent-runtime-snapshot.test.ts lib/chat-tool-selection.test.ts`
Expected: PASS.

- [x] **Step 3: Run agent eval harness unit tests**

Run: `pnpm exec tsx --test lib/agent-harness/model-tool-definitions.test.ts lib/agent-harness/tool-execution-context.test.ts`
Expected: PASS.

## Self-Review

- Spec coverage: Phase 1 covers introducing `TurnPlan`, preserving behavior, metadata exposure, and tool selection integration.
- Placeholder scan: no placeholder implementation tasks remain.
- Type consistency: `TurnPlan`, `AgentIntent`, `AgentRisk`, `VerificationPolicy`, and `TargetRef` are introduced in Task 1 and reused in later tasks.
