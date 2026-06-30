# Agent Core TurnPlan Design

Date: 2026-07-01

## Purpose

QuickerAgent already has a capable agent runtime: chat modes, prompt assembly, tool bundles, skill preloading, context compression, structured tool feedback, and recovery hints. The current design works, but agent behavior is spread across keyword rules, prompt tables, hard-coded tool bundles, and per-tool feedback. As tools and skills grow, this makes the agent harder to improve systematically.

This design introduces a single agent-core concept: `TurnPlan`. Each chat turn resolves a structured plan before model execution. The plan becomes the shared input for system prompt blocks, tool exposure, skill loading, recovery behavior, and verification policy.

The product remains QuickerAgent. This is not a UI redesign. Action editor UI, action chips, workbench surfaces, and launcher UI remain native `agent-gui` product capabilities. The focus here is agent algorithms and capability design.

## Goals

- Make each turn's intent, risk, target, tools, skills, recovery, and verification explicit.
- Reduce prompt-only routing by moving stable decisions into typed runtime logic.
- Improve tool quality by exposing the right capability set, with narrow tool schemas, instead of relying on large static prompts.
- Improve skill quality by matching skills to scenarios through a registry, not scattered keyword patches.
- Make qkrpc a default strong capability domain inside QuickerAgent's agent core without renaming existing qkrpc tools.
- Preserve existing chat modes: `agent`, `ask`, and `launcher`.
- Preserve QuickerAgent's native action editor and workbench design.

## Non-Goals

- No visual redesign.
- No rename from `qkrpc` to another product term.
- No sidecar runtime plugin system for qkrpc in this phase.
- No mega-tool consolidation. Tool boundaries remain intent-level and permission-aware.
- No replacement of Vercel AI SDK or the existing streaming loop.

## Current State

Relevant existing modules:

- `agent-gui/lib/agent-turn-state.ts`: infers coarse intent, risk, recommended tools, and verification hints.
- `agent-gui/lib/tool-bundles.ts`: defines core and specialized tool bundles.
- `agent-gui/lib/chat-tool-selection.ts`: resolves active bundles and full-schema tool ids.
- `agent-gui/lib/agent-skills/skill-intent-preload.ts`: maps authoring scenarios to brief skill snippets.
- `agent-gui/lib/instructions.ts`: builds large mode-specific system prompts.
- `agent-gui/lib/tool-routing.ts`: injects static tool routing rows.
- `agent-gui/lib/tool-result.ts`: defines structured tool output and `nextActions`.
- `agent-gui/lib/agent-recovery-policy.ts`: chooses recovery decisions from recent tool feedback.
- `agent-gui/lib/agent-runtime-snapshot.ts`: records turn state and recovery metadata for UI and model context.

The architecture already points toward a layered agent core, but the center is missing. `TurnPlan` fills that role.

## Proposed Core Model

```ts
export type AgentIntent =
  | "conversation"
  | "workspace"
  | "web"
  | "quicker_runtime"
  | "quicker_authoring"
  | "quicker_settings"
  | "agent_config";

export type AgentRisk = "read" | "write" | "destructive";

export type VerificationPolicy =
  | "none"
  | "explain_only"
  | "diagnostics"
  | "debug"
  | "test"
  | "ask_user";

export type TargetRef = {
  kind:
    | "action"
    | "global_subprogram"
    | "embedded_subprogram"
    | "workspace_path"
    | "web_page"
    | "setting"
    | "unknown";
  id?: string;
  label?: string;
  source: "mention" | "designer" | "history" | "user_text" | "tool_feedback";
};

export type TurnPlan = {
  mode: "agent" | "ask" | "launcher";
  userText: string;
  intent: AgentIntent;
  risk: AgentRisk;
  targets: TargetRef[];
  capabilityBundles: string[];
  skillHints: string[];
  requiredToolIds: string[];
  fullSchemaToolIds: string[];
  slimToolIds: string[];
  blockedToolIds: string[];
  nextAction?: ToolNextAction;
  verificationPolicy: VerificationPolicy;
  systemHints: string[];
};
```

`TurnPlan` is computed server-side before `streamText`. It is deterministic where possible and can remain rule-based at first. Later, parts of it can be model-assisted or benchmark-tuned without changing the rest of the runtime.

## TurnPlan Lifecycle

1. Normalize the turn:
   - Resolve chat mode.
   - Extract latest user text.
   - Expand slash commands.
   - Resolve cwd.
   - Extract action mentions and designer context.

2. Build `TurnSignals`:
   - User text.
   - Chat mode.
   - Pinned action/subprogram refs.
   - Designer embedded entity.
   - Enabled tools.
   - Recent structured tool feedback.
   - Slash command name.
   - Recent failed tool calls and `nextActions`.

3. Resolve `TurnPlan`:
   - Classify intent and risk.
   - Resolve targets.
   - Select capability bundles.
   - Rank skills.
   - Select required and full-schema tools.
   - Apply recovery decision.
   - Pick verification policy.
   - Emit concise system hints.

4. Assemble model context:
   - Base system prompt for mode.
   - TurnPlan prompt block.
   - Capability-provided prompt blocks.
   - Skill brief blocks.
   - Action scope and designer blocks.
   - Context compression suffix.

5. Execute model stream:
   - Tools are selected from the plan.
   - Tool outputs return structured feedback.
   - Feedback updates future TurnPlans.

6. Verify and summarize:
   - Use plan verification policy to nudge or require diagnostics, debug, tests, or user confirmation.
   - Store plan metadata on the assistant message for evaluation and replay.

## Capability Registry

Introduce a typed registry to replace hard-coded bundle ownership.

```ts
export type AgentCapability = {
  id: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  intents: AgentIntent[];
  tools: CapabilityToolDef[];
  skills?: CapabilitySkillDef[];
  promptBlocks?: CapabilityPromptBlock[];
  contextProviders?: CapabilityContextProvider[];
  verificationPolicies?: CapabilityVerificationPolicy[];
  health?: CapabilityHealthProvider;
};
```

Initial capabilities:

- `core.chat`: ask question, title, thread metadata, mode rules.
- `core.workspace`: Read, Write, StrReplace, Grep, Shell.
- `core.web`: web search and browser automation.
- `core.agent_defs`: slash commands, workspace AGENTS, skills, subagents.
- `qkrpc.runtime`: query, run, debug, float, wait.
- `qkrpc.authoring`: workspace_program, action/subprogram get/create, step-runner search/get, icons, triggers.
- `qkrpc.settings`: Quicker settings.
- `qkrpc.layout`: action page profiles, process layout, move.
- `qkrpc.destructive`: action/subprogram deletion.
- `agent.dev`: frontend check and benchmark/dev tools.

This keeps qkrpc names intact while making qkrpc one capability family rather than the implicit host identity.

## Tool Design

Tool boundaries should stay intent-level and permission-aware.

Rules:

- Do not collapse qkrpc action tools into one enum mega-tool.
- Do not merge `qkrpc_step_runner_search` and `qkrpc_step_runner_get`.
- Do not merge `workspace_program` with qkrpc action get/run/debug tools.
- Keep destructive tools separate and approval-aware.
- Keep implementation reuse behind the tools, not in the LLM-facing interface.

Tool selection changes:

- `TurnPlan.requiredToolIds`: tools that must be available this turn.
- `TurnPlan.fullSchemaToolIds`: tools whose full schema should be sent to the model.
- `TurnPlan.slimToolIds`: tools visible as stubs or discoverable through `list_tools`.
- `TurnPlan.blockedToolIds`: tools blocked by mode, risk, or user instruction.

`ask` mode should force `risk = read` and block write/destructive tools.

`launcher` mode should prefer direct-resolve flows and keep the existing low step cap.

`agent` mode should use intent and target context to load full schemas only when they matter.

## Skill Design

Skills should become capability-owned scenario guides.

Current `skill-intent-preload.ts` should evolve from a single keyword list into a registry:

```ts
export type SkillActivationRule = {
  skillId: string;
  capabilityId: string;
  intents: AgentIntent[];
  keywords?: string[];
  targetKinds?: TargetRef["kind"][];
  slashCommands?: string[];
  score: (signals: TurnSignals) => number;
  preloadSections: string[];
  maxChars: number;
  suppressDocsFor?: string[];
  suggestedToolQueries?: Record<string, string>;
};
```

Skill ranking should use:

- Intent.
- Targets.
- Slash command.
- Action pin/designer context.
- Recent tool feedback.
- Scenario keywords.
- Existing benchmark scenarios.

The model should see at most two scenario skill briefs by default. Full skill text remains available through docs or skill loading.

Session-preloaded essentials should remain small:

- qkrpc authoring hard rules.
- eval-expression hard rules.
- search-first guidance.
- recovery rules.

## Prompt Design

Move stable routing logic out of large static prose and into `TurnPlan`.

The system prompt should become:

1. Mode identity:
   - Agent, Ask, or Launcher.

2. Compact operating rules:
   - Communication.
   - Safety/risk.
   - Tool boundaries.
   - Verification expectation.

3. TurnPlan block:

```text
## Turn plan
Intent: quicker_authoring
Risk: write
Targets: action:...
Use capabilities: qkrpc.authoring, qkrpc.runtime
Full-schema tools: workspace_program, qkrpc_step_runner_search, qkrpc_step_runner_get
Skills: quicker-authoring-clipboard-pipeline
Verification: diagnostics
```

4. Capability prompt blocks:
   - Only for active capabilities.

5. Skill briefs:
   - Only for selected skills.

6. Dynamic context:
   - action scope, designer context, recovery decision, compression suffix.

`tool-routing.ts` remains useful, but should become capability-provided compact routing rows rather than one global table.

## Recovery and Verification

Structured tool feedback should feed the next `TurnPlan`, not just a prompt block.

Existing `ToolNextAction` stays:

```ts
type ToolNextAction = {
  tool: string;
  reason: string;
  input?: Record<string, unknown>;
  priority?: "required" | "recommended" | "optional";
};
```

Rules:

- Required `nextAction` should add that tool to `requiredToolIds`.
- User-decision feedback should set `verificationPolicy = "ask_user"` and block further write/destructive tools until the user responds.
- Connectivity failures should select `qkrpc_wait` once, then retry the original qkrpc tool if appropriate.
- Authoring patch success should select `diagnostics` or `debug` based on the task.
- Runtime failures should prefer debug/trace over blind rerun.

Verification policy:

- `none`: pure conversation or read-only answer.
- `explain_only`: ask mode explanation.
- `diagnostics`: after qkrpc program edits.
- `debug`: when action execution behavior matters.
- `test`: workspace code edits, builds, or agent-gui changes.
- `ask_user`: ambiguity, destructive action, missing credentials, or required user choice.

## Evaluation

Every assistant message should store TurnPlan metadata:

- Intent.
- Risk.
- Capability bundles.
- Skill hints.
- Full-schema tools.
- Next action.
- Verification policy.
- Whether verification happened.

This enables offline evaluation:

- Did the agent select the expected intent?
- Did it expose too many tools?
- Did it preload the right skill?
- Did it avoid repeated searches?
- Did it follow recovery hints?
- Did it verify after edits?

Existing benchmark scripts under `agent-gui/scripts/run-agent-eval*.ts` can add TurnPlan assertions before judging final answer quality.

## Migration Plan

Phase 1: Introduce TurnPlan without behavior change.

- Add `lib/agent-core/turn-plan.ts`.
- Move current `buildAgentTurnState` output into `TurnPlan`.
- Keep existing tool bundle and skill logic, but feed their decisions through the plan.
- Store TurnPlan in message metadata.
- Add tests matching current behavior.

Phase 2: Capability registry.

- Add `lib/agent-core/capabilities.ts`.
- Register current core and qkrpc capabilities.
- Generate tool bundles from capabilities.
- Keep existing tool ids and schemas.
- Convert `tool-bundles.ts` into compatibility exports.

Phase 3: Skill activation registry.

- Move `PATTERN_SKILL_RULES` into capability-owned rules.
- Add target-aware and recovery-aware scoring.
- Add tests for known authoring benchmark prompts.

Phase 4: Prompt thinning.

- Replace parts of `instructions.ts` and `tool-routing.ts` with TurnPlan and active capability prompt blocks.
- Keep static prompts short and mode-focused.
- Ensure no loss of hard qkrpc authoring rules.

Phase 5: Recovery and verification integration.

- Feed structured `nextActions` directly into the next TurnPlan.
- Add verification policy checks to eval metadata.
- Add tests for connectivity failure, patch diagnostics, debug-after-failure, and user decision blocks.

## Testing

Unit tests:

- `resolveTurnPlan` for each intent and mode.
- Capability bundle resolution.
- Full-schema vs slim tool selection.
- Skill activation scoring.
- Recovery to TurnPlan conversion.
- Verification policy selection.

Golden tests:

- Existing authoring benchmark prompts.
- Clipboard pipeline.
- evalexpression multi-var.
- getquicker scrape.
- step discovery read-only.
- launcher run/open.
- ask-mode read-only exploration.

Regression checks:

- No `get-ui` exposed to agent authoring.
- No docs substitution for step-runner `inputParams`.
- No Read/Write/StrReplace for `.quicker` program body edits.
- No destructive tool without explicit user ask.
- No qkrpc shell probe loops on connectivity failure.

## Open Questions

- Should `TurnPlan` ever be model-assisted, or remain deterministic until benchmarks show rule limits?
- Should workspace code edits and qkrpc authoring share a generic verification policy engine, or keep domain-specific policies?
- Should capability health be visible to the model every turn, or only after failure?
- Should skill activation support negative rules, such as "do not preload showText skill when user says no popup"?

## Self-Review

- Placeholder scan: no TBD or TODO placeholders remain.
- Scope check: this design targets agent algorithms and capability organization, not UI redesign.
- Consistency check: qkrpc names are preserved; action editor remains native agent-gui.
- Ambiguity check: qkrpc is a default capability family, not a sidecar runtime plugin in this phase.
- Risk check: migration is phased to preserve behavior before changing selection and prompt logic.
