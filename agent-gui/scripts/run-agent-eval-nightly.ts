/**
 * Nightly / local orchestrator: health check + batch eval presets.
 *
 *   pnpm agent-eval:nightly
 *   pnpm agent-eval:nightly -- --preset gui-smoke --skip-live
 *   pnpm agent-eval:nightly -- --preset gui-agent-defs --ui
 */
import { checkAgentGuiHealth } from "@/lib/agent-eval/health-check";
import { defaultAgentGuiBaseUrl } from "@/lib/agent-eval/chat-client";
import {
  aggregateAgentEvalCapabilitySummaries,
  formatAgentEvalCapabilityAggregate,
} from "@/lib/agent-eval/capability-summary";
import { parseAgentEvalNightlyArgs } from "@/lib/agent-eval/nightly-cli";
import {
  isAgentEvalReportPassing,
  loadEvalScenario,
  resolveEvalScenarioIds,
  runAgentGuiEvalScenario,
  runAgentGuiUiEvalScenario,
} from "@/lib/agent-eval";
import type { AgentEvalReport } from "@/lib/agent-eval/types";

async function main(): Promise<void> {
  const args = parseAgentEvalNightlyArgs(process.argv.slice(2));
  const baseUrl = defaultAgentGuiBaseUrl();

  const health = await checkAgentGuiHealth(baseUrl);
  if (!health.ok && !args.skipLive) {
    console.error(
      `agent-gui not reachable at ${baseUrl}: ${health.error ?? "unknown"}`,
    );
    console.error("Start: cd agent-gui && pnpm dev");
    console.error("Or pass --skip-live to only validate preset ids.");
    process.exitCode = 1;
    return;
  }

  if (args.skipLive) {
    const ids = resolveEvalScenarioIds({
      preset: args.preset,
      limit: args.limit,
    });
    console.log(JSON.stringify({ preset: args.preset, scenarioIds: ids }, null, 2));
    return;
  }

  const scenarioIds = resolveEvalScenarioIds({
    preset: args.preset,
    limit: args.limit,
  });

  console.error(
    `nightly: preset=${args.preset} scenarios=${scenarioIds.length} runner=${args.ui ? "agent-gui-ui" : "agent-gui"} base=${baseUrl}`,
  );

  const reports: AgentEvalReport[] = [];
  let failed = 0;

  for (const id of scenarioIds) {
    const scenario = loadEvalScenario(id);
    console.error(`\n=== ${scenario.id} cwd-fixture=${scenario.fixture ?? "repo"} ===`);
    const report = args.ui
      ? await runAgentGuiUiEvalScenario(scenario, {
          verifyMock: args.verifyMock,
          headless: !args.headed,
        })
      : await runAgentGuiEvalScenario(scenario, {
          verifyMock: args.verifyMock,
        });
    reports.push(report);
    if (!isAgentEvalReportPassing(report, { verifyMock: args.verifyMock })) {
      failed += 1;
    }
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.error(
        `done status=${report.status} tools=${report.toolCalls.length} trace=${report.traceRubric?.passed}`,
      );
    }
  }

  const capabilityAggregate = aggregateAgentEvalCapabilitySummaries(reports);
  const summary = {
    preset: args.preset,
    runner: args.ui ? "agent-gui-ui" : "agent-gui",
    total: reports.length,
    passed: reports.length - failed,
    failed,
    capabilityAggregate,
    health,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.error(`\n=== nightly summary: ${summary.passed}/${summary.total} passed ===`);
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
