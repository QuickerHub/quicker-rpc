export type AgentEvalNightlyCliArgs = {
  preset: string;
  limit?: number;
  skipLive: boolean;
  verifyMock: boolean;
  json: boolean;
  ui: boolean;
  headed: boolean;
};

export function parseAgentEvalNightlyArgs(
  argv: readonly string[],
): AgentEvalNightlyCliArgs {
  const presetIdx = argv.indexOf("--preset");
  const preset = presetIdx >= 0 ? argv[presetIdx + 1]! : "gui-smoke";
  const limitIdx = argv.indexOf("--limit");
  const limitRaw = limitIdx >= 0 ? argv[limitIdx + 1] : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;
  return {
    preset,
    limit: Number.isFinite(limit) ? limit : undefined,
    skipLive: argv.includes("--skip-live"),
    verifyMock: argv.includes("--verify-mock"),
    json: argv.includes("--json"),
    ui: argv.includes("--ui"),
    headed: argv.includes("--headed"),
  };
}
