/**

 * Run multiple agent-gui eval scenarios sequentially.

 *

 *   pnpm agent-eval:batch -- --preset gui-smoke
 *   pnpm agent-eval:batch -- --preset l2-core --limit 1 --json
 *   pnpm agent-eval:batch -- --preset gui-launcher --ui
 */
import { defaultAgentGuiBaseUrl } from "@/lib/agent-eval/chat-client";
import {
  aggregateAgentEvalCapabilitySummaries,
  formatAgentEvalCapabilityAggregate,
  formatAgentEvalCapabilitySummary,
} from "@/lib/agent-eval/capability-summary";
import { parseAgentEvalBatchArgs } from "@/lib/agent-eval/batch-cli";
import {
  isAgentEvalReportPassing,
  loadEvalScenario,
  resolveEvalScenarioIds,
  runAgentGuiEvalScenario,
  runAgentGuiUiEvalScenario,
} from "@/lib/agent-eval";
import type { AgentEvalReport } from "@/lib/agent-eval/types";

async function main(): Promise<void> {
  const args = parseAgentEvalBatchArgs(process.argv.slice(2));
  const scenarioIds = resolveEvalScenarioIds(args);

  console.error(
    `agent-gui batch: ${scenarioIds.length} scenario(s) runner=${args.ui ? "agent-gui-ui" : "agent-gui"} base=${defaultAgentGuiBaseUrl()} [${scenarioIds.join(", ")}]`,
  );


  const summary: AgentEvalReport[] = [];

  let failed = 0;



  for (const scenarioId of scenarioIds) {

    const scenario = loadEvalScenario(scenarioId);

    console.error(

      `\n=== ${scenario.id} (${scenario.source}/${scenario.chatMode}) ${scenario.label} ===`,

    );



    const report = args.ui
      ? await runAgentGuiUiEvalScenario(scenario, {
          verifyMock: args.verifyMock,
          headless: !args.headed,
        })
      : await runAgentGuiEvalScenario(scenario, {
          verifyMock: args.verifyMock,
        });
    summary.push(report);



    if (!isAgentEvalReportPassing(report, { verifyMock: args.verifyMock })) {

      failed += 1;

    }



    if (args.json) {

      console.log(JSON.stringify(report, null, 2));

    } else {

      console.error(
        `done status=${report.status} durationMs=${report.durationMs} tools=${report.toolCalls.length}`,
      );
      console.error(formatAgentEvalCapabilitySummary(report.capabilitySummary));
      console.error(`written ${report.outPath}`);
    }
  }



  const capabilityAggregate = aggregateAgentEvalCapabilitySummaries(summary);

  if (args.json) {
    console.log(JSON.stringify({ capabilityAggregate }, null, 2));
  } else {
    console.error(`\n=== summary: ${summary.length - failed}/${summary.length} passed ===`);
    console.error(formatAgentEvalCapabilityAggregate(capabilityAggregate));
  }


  if (failed > 0) {

    process.exitCode = 1;

  }

}



main().catch((err: unknown) => {

  console.error(err);

  process.exitCode = 1;

});

