import type {
  SessionAnalysisResult,
  SessionOptimizationHint,
  SessionRuleFinding,
} from "@/lib/agent-session-analysis/types";

const OPTIMIZATION_MAP: Record<
  string,
  { targets: string[]; suggestion: string }
> = {
  "schema-validation-error": {
    targets: ["agent-gui/lib/qkrpc-action-tool.server.ts", "agent-gui/lib/tool-registry.ts"],
    suggestion:
      "Add explicit object-typed examples in tool description; avoid JSON.stringify for nested params.",
  },
  "token-baseline-high": {
    targets: [
      "agent-gui/lib/agent-harness/model-tool-definitions.ts",
      "agent-gui/lib/tool-intent-filter.ts",
      "docs/agent-gui-prompt-structure.md",
    ],
    suggestion: "Slim tool definitions for action_authoring intent on first turn.",
  },
  "docs-call-heavy": {
    targets: ["agent-gui/lib/agent-skills/prompt.ts", "docs/skills/quicker-authoring/"],
    suggestion: "Preload pattern skill (e.g. conditional-http) when user prompt matches keywords.",
  },
  "C-duplicate-search": {
    targets: ["QuickerRpc.AgentModel/Catalog/StepRunnerCatalogMapper.cs"],
    suggestion: "Return controlField enum summary in search results to avoid re-search.",
  },
  "create-then-read-data": {
    targets: ["docs/skills/quicker-authoring/prompt-tier0.md"],
    suggestion: "After qkrpc_action_create, go directly to write_data — skip read_data on empty program.",
  },
  "redundant-read-empty-data": {
    targets: ["docs/skills/quicker-authoring/prompt-tier0.md"],
    suggestion: "Same as create-then-read-data.",
  },
  "tool-call-count-high": {
    targets: [
      "docs/skills/quicker-authoring/prompt-tier0.md",
      "agent-gui/lib/agent-skills/prompt-catalog.ts",
    ],
    suggestion: "Reduce exploration via pattern skills and tighter authoring workflow in tier0.",
  },
  "write-without-step-runner-get": {
    targets: ["docs/skills/quicker-authoring/prompt-tier0.md"],
    suggestion: "Enforce search → get before any write_data containing step inputParams.",
  },
};

export function buildOptimizationHints(
  findings: readonly SessionRuleFinding[],
  traceViolations: readonly string[],
): SessionOptimizationHint[] {
  const hints: SessionOptimizationHint[] = [];
  const seen = new Set<string>();

  for (const finding of findings) {
    const mapped = OPTIMIZATION_MAP[finding.ruleId];
    if (!mapped || seen.has(finding.ruleId)) continue;
    seen.add(finding.ruleId);
    hints.push({
      finding,
      targets: finding.optimizeHint
        ? [finding.optimizeHint, ...mapped.targets]
        : mapped.targets,
      suggestion: mapped.suggestion,
    });
  }

  for (const violation of traceViolations) {
    if (!violation.startsWith("E:")) continue;
    const key = `trace:${violation.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push({
      finding: {
        ruleId: "trace-rubric",
        severity: "error",
        message: violation,
      },
      targets: ["docs/agent-authoring-benchmark.md", "agent-gui/lib/agent-eval/trace-rubric.ts"],
      suggestion: "Fix agent flow to satisfy E-axis rubric; add regression in tool-intent-scenarios if systemic.",
    });
  }

  return hints;
}

export function formatSessionAnalysisReport(result: SessionAnalysisResult): string {
  const { export: payload, matchedTask, trace, optimizationHints } = result;
  const lines: string[] = [];

  lines.push("# QuickerAgent Session Analysis");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Thread | ${payload.thread.title} (\`${payload.thread.id.slice(0, 8)}\`) |`);
  lines.push(`| Exported | ${payload.exportedAt} |`);
  lines.push(`| User turns | ${trace.metrics.userTurnCount} |`);
  lines.push(`| Tool calls | ${trace.metrics.toolCallCount} |`);
  lines.push(`| Tool errors | ${trace.metrics.errorCount} (retries: ${trace.metrics.retryCount}) |`);
  lines.push(
    `| Tokens | in ${trace.metrics.inputTokens} / out ${trace.metrics.outputTokens} / total ${trace.metrics.totalTokens} |`,
  );
  if (trace.metrics.staticContextTokens !== undefined) {
    lines.push(`| Static context | ~${trace.metrics.staticContextTokens} tokens (system+tools) |`);
  }
  if (trace.agentTurnState) {
    lines.push(`| Intent | ${trace.agentTurnState.intent} (${trace.agentTurnState.risk}) |`);
  }
  if (matchedTask) {
    lines.push(`| Matched benchmark | \`${matchedTask.id}\` (${matchedTask.tier}) |`);
  }
  lines.push("");

  lines.push("## User prompt");
  lines.push("");
  lines.push("```");
  lines.push(trace.userPrompt || "(empty)");
  lines.push("```");
  lines.push("");

  lines.push("## Tool timeline");
  lines.push("");
  for (const [index, call] of trace.toolCalls.entries()) {
    const status = call.state === "output-error" ? "ERROR" : "ok";
    const action =
      call.toolName === "workspace_program" && call.input?.action
        ? ` action=${String(call.input.action)}`
        : "";
    lines.push(`${index + 1}. \`${call.toolName}\`${action} — ${status}`);
    if (call.errorText) {
      lines.push(`   - ${call.errorText.split("\n")[0]?.slice(0, 140)}`);
    }
  }
  lines.push("");

  lines.push("## Findings");
  lines.push("");
  const allFindings = [
    ...trace.findings,
    ...trace.traceRubric.violations.map(
      (message): SessionRuleFinding => ({
        ruleId: "trace-rubric",
        severity: "error",
        message,
      }),
    ),
  ];
  if (allFindings.length === 0) {
    lines.push("_No rule violations detected._");
  } else {
    for (const finding of allFindings) {
      lines.push(`- **[${finding.severity}]** \`${finding.ruleId}\`: ${finding.message}`);
    }
  }
  lines.push("");

  lines.push(`## Trace rubric (E-axis): ${trace.traceRubric.passed ? "PASS" : "FAIL"}`);
  lines.push("");

  if (optimizationHints.length > 0) {
    lines.push("## Optimization hints");
    lines.push("");
    for (const [index, hint] of optimizationHints.entries()) {
      lines.push(`### ${index + 1}. ${hint.finding.ruleId}`);
      lines.push("");
      lines.push(hint.suggestion);
      lines.push("");
      lines.push("Targets:");
      for (const target of hint.targets) {
        lines.push(`- \`${target}\``);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

export function formatSessionAnalysisJson(result: SessionAnalysisResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
