/**
 * Live autopilot batch: eval → export → analysis for multiple scenarios.
 *
 *   pnpm agent-autopilot:batch -- --preset autopilot-core
 *   pnpm agent-autopilot:batch -- discover-step-expr multi-var-assign --json
 */
import {
  resolveAutopilotScenarioIds,
  runAgentAutopilotBatch,
} from "@/lib/agent-autopilot/batch";

function parseArgs(argv: string[]): {
  scenarioIds: string[];
  json: boolean;
  noApply: boolean;
  llmSelection?: string;
} {
  const json = argv.includes("--json");
  const noApply = argv.includes("--no-apply");
  const presetIdx = argv.indexOf("--preset");
  const preset = presetIdx >= 0 ? argv[presetIdx + 1] : undefined;
  const limitIdx = argv.indexOf("--limit");
  const limitRaw = limitIdx >= 0 ? argv[limitIdx + 1] : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const llmFlag = argv.indexOf("--llm");
  const llmSelection = llmFlag >= 0 ? argv[llmFlag + 1] : undefined;
  const positional = argv.filter(
    (a) =>
      !a.startsWith("-")
      && a !== preset
      && a !== limitRaw
      && a !== llmSelection,
  );

  const scenarioIds = resolveAutopilotScenarioIds({
    ids: positional.length ? positional : undefined,
    preset,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return { scenarioIds, json, noApply, llmSelection };
}

async function main(): Promise<void> {
  const { scenarioIds, json, noApply, llmSelection } = parseArgs(process.argv.slice(2));

  console.error(
    `agent-autopilot:batch ${scenarioIds.length} scenario(s) apply=${!noApply}`,
  );

  const batch = await runAgentAutopilotBatch({
    scenarioIds,
    llmSelection,
    applyHints: !noApply,
  });

  if (json) {
    console.log(JSON.stringify(batch, null, 2));
  } else {
    for (const result of batch.results) {
      console.error(
        `${result.scenarioId}: chatOk=${result.chatOk} tools=${result.toolCallCount} trace=${result.tracePassed}`,
      );
      if (result.chatError) console.error(`  chatError: ${result.chatError}`);
      for (const f of result.analysis.trace.findings) {
        console.error(`  [${f.severity}] ${f.ruleId}: ${f.message}`);
      }
    }
    console.error(`\n=== ${batch.passed}/${batch.results.length} passed ===`);
  }

  if (batch.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
