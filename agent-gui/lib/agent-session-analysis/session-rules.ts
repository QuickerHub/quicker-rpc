import type { SessionMetrics, SessionRuleFinding, SessionToolCall } from "@/lib/agent-session-analysis/types";

const STATIC_CONTEXT_TOKEN_WARN = 10_000;

function inputAction(call: SessionToolCall): string | undefined {
  const action = call.input?.action;
  return typeof action === "string" ? action : undefined;
}

function inputJson(call: SessionToolCall): string {
  try {
    return JSON.stringify(call.input ?? {});
  } catch {
    return "";
  }
}

/** Session-specific rules beyond agent-eval trace-rubric (E-axis). */
export function evaluateSessionRules(
  toolCalls: readonly SessionToolCall[],
  metrics: SessionMetrics,
): SessionRuleFinding[] {
  const findings: SessionRuleFinding[] = [];

  for (const call of toolCalls) {
    if (call.state !== "output-error" || !call.errorText) continue;
    if (call.errorClass === "schema") {
      findings.push({
        ruleId: "schema-validation-error",
        severity: "warn",
        message: `${call.toolName}: schema validation failed (${truncate(call.errorText, 120)})`,
        optimizeHint: `lib/*-tool.server.ts — add object example to ${call.toolName} description`,
      });
    } else {
      findings.push({
        ruleId: "tool-error",
        severity: "error",
        message: `${call.toolName}: ${truncate(call.errorText, 160)}`,
      });
    }
  }

  findings.push(...detectDuplicateStepRunnerSearch(toolCalls));
  findings.push(...detectDuplicateActionCreate(toolCalls));
  findings.push(...detectRedundantEmptyRead(toolCalls));
  findings.push(...detectCreateThenReadEmpty(toolCalls));

  if (
    metrics.userTurnCount <= 1
    && metrics.staticContextTokens !== undefined
    && metrics.staticContextTokens >= STATIC_CONTEXT_TOKEN_WARN
  ) {
    findings.push({
      ruleId: "token-baseline-high",
      severity: "info",
      message: `Static context (system+tools) ≈ ${metrics.staticContextTokens} tokens on first user turn.`,
      optimizeHint:
        "lib/agent-harness/model-tool-definitions.ts, lib/tool-intent-filter.ts — slim tools for authoring intent",
    });
  }

  if (metrics.toolCallCount >= 20 && metrics.userTurnCount <= 1) {
    findings.push({
      ruleId: "tool-call-count-high",
      severity: "info",
      message: `${metrics.toolCallCount} tool calls for ${metrics.userTurnCount} user turn(s).`,
      optimizeHint:
        "docs/skills/quicker-authoring/prompt-tier0.md — preload pattern skills to reduce exploration",
    });
  }

  const docsCount = toolCalls.filter((call) => call.toolName === "docs").length;
  if (docsCount >= 3) {
    findings.push({
      ruleId: "docs-call-heavy",
      severity: "warn",
      message: `${docsCount} docs tool calls — consider preloading matching pattern skill.`,
      optimizeHint: "lib/agent-skills/skill-intent-preload.ts — intent-based pattern skill preload",
    });
  }

  const writeBeforeGet = toolCalls.some(
    (call) =>
      call.toolName === "workspace_program"
      && inputAction(call) === "write_data"
      && /inputParams/.test(inputJson(call)),
  );
  const sawGet = toolCalls.some((call) => call.toolName === "qkrpc_step_runner_get");
  if (writeBeforeGet && !sawGet) {
    findings.push({
      ruleId: "write-without-step-runner-get",
      severity: "warn",
      message: "write_data with step inputParams but no qkrpc_step_runner_get in trace.",
      optimizeHint: "docs/skills/quicker-authoring/prompt-tier0.md — search → get before patch/write",
    });
  }

  return findings;
}

function detectDuplicateStepRunnerSearch(
  toolCalls: readonly SessionToolCall[],
): SessionRuleFinding[] {
  const findings: SessionRuleFinding[] = [];
  const seenQueries = new Map<string, number>();

  for (const call of toolCalls) {
    if (call.toolName !== "qkrpc_step_runner_search") continue;
    const query = typeof call.input?.query === "string" ? call.input.query.trim().toLowerCase() : "";
    if (!query) continue;
    const count = (seenQueries.get(query) ?? 0) + 1;
    seenQueries.set(query, count);
    if (count >= 2) {
      findings.push({
        ruleId: "C-duplicate-search",
        severity: "warn",
        message: `Duplicate step_runner_search query: "${call.input?.query}"`,
        optimizeHint:
          "QuickerRpc.AgentModel/Catalog/StepRunnerCatalogMapper.cs — enrich search results with controlField options",
      });
    }
  }

  return findings;
}

function detectDuplicateActionCreate(
  toolCalls: readonly SessionToolCall[],
): SessionRuleFinding[] {
  let sawSuccessfulCreate = false;
  for (const call of toolCalls) {
    if (call.toolName !== "qkrpc_action_create") continue;
    if (sawSuccessfulCreate) {
      return [{
        ruleId: "duplicate-action-create",
        severity: "warn",
        message: "Multiple qkrpc_action_create in one turn — reuse first actionId.",
        optimizeHint: "lib/qkrpc-action-tool.server.ts — block duplicate create per turn",
      }];
    }
    if (actionCreateSucceeded(call)) {
      sawSuccessfulCreate = true;
    }
  }
  return [];
}

function actionCreateSucceeded(call: SessionToolCall): boolean {
  if (call.output?.ok === false) {
    return false;
  }
  const data = call.output?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }
  const record = data as Record<string, unknown>;
  if (record.ok === false || record.success === false) {
    return false;
  }
  const actionId = record.actionId;
  return typeof actionId === "string" && actionId.trim().length > 0;
}

function detectRedundantEmptyRead(
  toolCalls: readonly SessionToolCall[],
): SessionRuleFinding[] {
  for (const call of toolCalls) {
    if (call.toolName !== "workspace_program" || inputAction(call) !== "read_data") continue;
    const data = call.output?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    const content = (data as Record<string, unknown>).content;
    if (typeof content === "string" && /"steps"\s*:\s*\[\s*\]/.test(content)) {
      return [{
        ruleId: "redundant-read-empty-data",
        severity: "info",
        message: "read_data returned empty steps[] — skip after action create.",
        optimizeHint: "docs/skills/quicker-authoring/prompt-tier0.md — create → write_data, no read",
      }];
    }
  }
  return [];
}

function detectCreateThenReadEmpty(
  toolCalls: readonly SessionToolCall[],
): SessionRuleFinding[] {
  let createIndex = -1;
  for (let i = 0; i < toolCalls.length; i += 1) {
    if (toolCalls[i]?.toolName === "qkrpc_action_create") {
      createIndex = i;
      break;
    }
  }
  if (createIndex < 0) return [];

  for (let i = createIndex + 1; i < toolCalls.length; i += 1) {
    const call = toolCalls[i]!;
    if (call.toolName === "workspace_program" && inputAction(call) === "patch") {
      return [];
    }
    if (call.toolName !== "workspace_program" || inputAction(call) !== "read_data") continue;
    return [{
      ruleId: "create-then-read-data",
      severity: "info",
      message: "read_data after qkrpc_action_create — create response already includes empty data.json.",
      optimizeHint: "docs/skills/quicker-authoring/prompt-tier0.md",
    }];
  }
  return [];
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
