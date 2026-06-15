/**
 * Run one eval scenario via /tool-test UI (Playwright + production useChat stack).
 *
 *   pnpm agent-eval:ui -- discover-step-expr
 *   pnpm agent-eval:ui -- launcher-open-hotkeys --json
 */
import { defaultAgentGuiBaseUrl } from "@/lib/agent-eval/chat-client";
import { formatAgentEvalCapabilitySummary } from "@/lib/agent-eval/capability-summary";
import { runJudgeOnReport } from "@/lib/agent-eval/judge-runner";
import { isAgentEvalReportPassing } from "@/lib/agent-eval/run-task";
import { runAgentGuiUiEvalTaskById } from "@/lib/agent-eval/run-task-ui";

function parseArgs(argv: string[]): {
  taskId: string;
  json: boolean;
  verifyMock: boolean;
  judge: boolean;
  headed: boolean;
} {
  const positional = argv.filter((a) => !a.startsWith("-"));
  const taskId = positional[0];
  if (!taskId) {
    throw new Error(
      "Usage: pnpm agent-eval:ui -- <scenario-id> [--json] [--verify-mock] [--judge] [--headed]",
    );
  }
  return {
    taskId,
    json: argv.includes("--json"),
    verifyMock: argv.includes("--verify-mock"),
    judge: argv.includes("--judge"),
    headed: argv.includes("--headed"),
  };
}

async function main(): Promise<void> {
  const { taskId, json, verifyMock, judge, headed } = parseArgs(
    process.argv.slice(2),
  );

  console.error(
    `agent-gui UI eval: scenario=${taskId} base=${defaultAgentGuiBaseUrl()} headless=${!headed}`,
  );

  let report = await runAgentGuiUiEvalTaskById(taskId, {
    verifyMock,
    headless: !headed,
  });

  if (judge && report.outPath) {
    const judged = runJudgeOnReport(report.outPath);
    if (judged.report) {
      report = judged.report;
    } else if (judged.judge) {
      report = { ...report, judge: judged.judge };
    }
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.error(`\n---\nwritten ${report.outPath}`);
    console.error(
      `status=${report.status} tools=${report.toolCalls.length} durationMs=${report.durationMs}`,
    );
    console.error(formatAgentEvalCapabilitySummary(report.capabilitySummary));
    if (report.traceRubric && !report.traceRubric.passed) {
      for (const violation of report.traceRubric.violations) {
        console.error(`trace: ${violation}`);
      }
    }
    if (report.error) {
      console.error(`error: ${report.error}`);
    }
  }

  if (!isAgentEvalReportPassing(report, { verifyMock, requireJudge: judge })) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
