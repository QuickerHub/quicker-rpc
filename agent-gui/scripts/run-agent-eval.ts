/**

 * Run one eval scenario via agent-gui /api/chat (production agent stack).

 *

 *   pnpm agent-eval -- discover-step-expr

 *   pnpm agent-eval -- launcher-open-hotkeys --json

 *   pnpm agent-eval -- clip-lines-expr --verify-mock --judge --json

 */

import { defaultAgentGuiBaseUrl } from "@/lib/agent-eval/chat-client";
import { formatAgentEvalCapabilitySummary } from "@/lib/agent-eval/capability-summary";
import { runJudgeOnReport } from "@/lib/agent-eval/judge-runner";
import {

  isAgentEvalReportPassing,

  runAgentGuiEvalTaskById,

} from "@/lib/agent-eval/run-task";



function parseArgs(argv: string[]): {

  taskId: string;

  json: boolean;

  verifyMock: boolean;

  judge: boolean;

} {

  const positional = argv.filter((a) => !a.startsWith("-"));

  const taskId = positional[0];

  if (!taskId) {

    throw new Error(

      "Usage: pnpm agent-eval -- <scenario-id> [--json] [--verify-mock] [--judge]",

    );

  }

  return {

    taskId,

    json: argv.includes("--json"),

    verifyMock: argv.includes("--verify-mock"),

    judge: argv.includes("--judge"),

  };

}



async function main(): Promise<void> {

  const { taskId, json, verifyMock, judge } = parseArgs(process.argv.slice(2));



  console.error(

    `agent-gui eval: scenario=${taskId} base=${defaultAgentGuiBaseUrl()} verifyMock=${verifyMock} judge=${judge}`,

  );



  let report = await runAgentGuiEvalTaskById(taskId, { verifyMock });



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

    if (report.mockVerify) {

      console.error(`mockVerify ok=${report.mockVerify.ok}`);

    }

    if (report.judge) {

      console.error(

        `judge percent=${report.judge.percent ?? "—"} passed=${report.judge.passed}`,

      );

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

