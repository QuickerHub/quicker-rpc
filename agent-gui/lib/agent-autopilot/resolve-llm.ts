import { runLlmEndpointProbeReport } from "@/lib/llm-endpoint-probe-core";
import { listLlmProbeTargetsFromFiles } from "@/lib/llm-endpoint-probe-files";

/** Pick first chat-OK endpoint for live agent eval / autopilot. */
export async function resolveWorkingEvalLlmSelection(): Promise<string> {
  const explicit = process.env.AGENT_EVAL_LLM_SELECTION?.trim();
  if (explicit) return explicit;

  const report = await runLlmEndpointProbeReport({
    source: "merged",
    method: "chat",
    timeoutMs: 12_000,
    listTargets: listLlmProbeTargetsFromFiles,
  });

  const okRow = report.rows.find((row) => row.ok);
  if (okRow) {
    const source = okRow.sources[0]?.trim();
    const model = okRow.model?.trim();
    if (source && model) {
      return `profile:${source}/${encodeURIComponent(model)}`;
    }
    if (okRow.group === "deepseek") return "deepseek";
  }

  return "deepseek";
}
