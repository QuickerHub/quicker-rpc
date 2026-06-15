export type AgentEvalBatchCliArgs = {
  ids?: string[];
  tier?: string;
  preset?: string;
  limit?: number;
  json: boolean;
  verifyMock: boolean;
  ui: boolean;
  headed: boolean;
};

export function parseAgentEvalBatchArgs(
  argv: readonly string[],
): AgentEvalBatchCliArgs {
  const json = argv.includes("--json");
  const verifyMock = argv.includes("--verify-mock");
  const ui = argv.includes("--ui");
  const headed = argv.includes("--headed");
  const tierIdx = argv.indexOf("--tier");
  const tier = tierIdx >= 0 ? argv[tierIdx + 1] : undefined;
  const presetIdx = argv.indexOf("--preset");
  const preset = presetIdx >= 0 ? argv[presetIdx + 1] : undefined;
  const limitIdx = argv.indexOf("--limit");
  const limitRaw = limitIdx >= 0 ? argv[limitIdx + 1] : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const ids = argv.filter(
    (a) =>
      !a.startsWith("-")
      && a !== tier
      && a !== preset
      && a !== limitRaw,
  );

  return {
    ids: ids.length ? ids : undefined,
    tier,
    preset,
    limit: Number.isFinite(limit) ? limit : undefined,
    json,
    verifyMock,
    ui,
    headed,
  };
}
