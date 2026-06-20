/**
 * Live agent → export → session-analysis → optional auto-hints.
 *
 *   pnpm agent-autopilot -- discover-step-expr
 *   pnpm agent-autopilot -- multi-var-assign --no-apply
 *   pnpm agent-autopilot -- slash-author-bundled --json
 */
import { runAgentAutopilotScenario } from "@/lib/agent-autopilot/run-loop";

function parseArgs(argv: string[]): {
  scenarioId: string;
  json: boolean;
  noApply: boolean;
  llmSelection?: string;
} {
  const positional = argv.filter((a) => !a.startsWith("-"));
  const scenarioId = positional[0];
  if (!scenarioId) {
    throw new Error(
      "Usage: pnpm agent-autopilot -- <scenario-id> [--json] [--no-apply] [--llm <selection>]",
    );
  }
  const llmFlag = argv.indexOf("--llm");
  const llmSelection = llmFlag >= 0 ? argv[llmFlag + 1] : undefined;
  return {
    scenarioId,
    json: argv.includes("--json"),
    noApply: argv.includes("--no-apply"),
    llmSelection,
  };
}

async function main(): Promise<void> {
  const { scenarioId, json, noApply, llmSelection } = parseArgs(process.argv.slice(2));

  console.error(`agent-autopilot: scenario=${scenarioId} apply=${!noApply}`);

  const result = await runAgentAutopilotScenario(scenarioId, {
    llmSelection,
    applyHints: !noApply,
  });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error(`llm=${result.llmSelection}`);
    console.error(`chatOk=${result.chatOk} tools=${result.toolCallCount} trace=${result.tracePassed}`);
    if (result.chatError) console.error(`chatError: ${result.chatError}`);
    console.error(`export: ${result.exportPath}`);
    console.error(`report: ${result.reportPath}`);
    console.error(
      `findings: ${result.analysis.trace.findings.length} `
      + `rubric=${result.analysis.trace.traceRubric.passed ? "PASS" : "FAIL"}`,
    );
    for (const finding of result.analysis.trace.findings.slice(0, 5)) {
      console.error(`  [${finding.severity}] ${finding.ruleId}: ${finding.message}`);
    }
    if (result.appliedHints.length > 0) {
      console.error("applied:");
      for (const line of result.appliedHints) console.error(`  + ${line}`);
    }
    if (result.skippedHints.length > 0) {
      console.error("skipped:");
      for (const line of result.skippedHints.slice(0, 8)) console.error(`  - ${line}`);
    }
  }

  const failed =
    !result.chatOk
    || !result.tracePassed
    || result.analysis.trace.findings.some((f) => f.severity === "error");
  if (failed) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
