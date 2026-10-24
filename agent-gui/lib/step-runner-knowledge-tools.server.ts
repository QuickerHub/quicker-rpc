import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { formatQkrpcResultForAgent, runQkrpcForTool } from "./qkrpc";
import { incrementStepRunnerSearchCountThisTurn } from "./program-turn-context";
import { formatLocalToolResult } from "./tool-result";
import { formatToolResultForAgent } from "./tool-result-agent-view";

type KnowledgeRunner = (args: string[], options: { timeoutMs: number }) => Promise<Record<string, unknown>>;

const nativeRunner: KnowledgeRunner = async (args, options) =>
  formatQkrpcResultForAgent(await runQkrpcForTool(args, options));

/** Reuse requires a provider revision; a thread id cannot certify native knowledge freshness. */
export function createStepRunnerKnowledgeTools(run: KnowledgeRunner = nativeRunner) {
  return {
    qkrpc_step_runner_search: tool({
      description:
        "Search the currently connected StepRunner catalog before adding/editing steps when a module key is uncertain. "
        + "Results are fetched again, including after an upgrade or a failed lookup; conversation history is not a current catalog. "
        + "Space-separated terms try AND first, then OR when empty; | is explicit OR and * is a wildcard. "
        + "Use returned keys and controlField values with qkrpc_step_runner_get. NOT for running actions or get-ui.",
      inputSchema: z.object({
        query: z.string().describe("Module names or short search terms; | separates alternatives"),
        limit: z.number().int().min(1).max(80).optional().describe("Max results (default 20)"),
      }),
      execute: async ({ query, limit }) => {
        const args = ["step-runner", "search", "--query", query];
        if (limit != null) args.push("--limit", String(limit));
        const result = await run(args, { timeoutMs: 180_000 });
        incrementStepRunnerSearchCountThisTurn();
        return formatToolResultForAgent("qkrpc_step_runner_search", { query, limit }, result);
      },
    }),
    qkrpc_step_runner_get: tool({
      description:
        "Read the current Agent-only compressed StepRunner schema before workspace_program step edits; do not guess inputs. "
        + "Fetch again when the connected host or module may have changed; old messages are not current schema. "
        + "Read knowledge.source and its host/session: runtime-definition is observed native knowledge; bundled-adapter and unknown do not prove native support. "
        + "A schema revision is a content fingerprint, not a freshness check or write permission. Prefer nativeHelpLink for the current module; bundledReference is supplemental. "
        + "If schemaJsonOmitted is true, the remaining provenance/parameter names are incomplete; do not infer missing editing rules. "
        + "Write short wire key/inputs/outputs (never stepKey). "
        + "Var bind: \"paramKey.var\":\"varKey\"; interpolation: $$…{varKey}…; file: paramKey.file. NOT get-ui.",
      inputSchema: z.object({
        key: z.string().optional().describe("items[].key from qkrpc_step_runner_search"),
        runnerKey: z.string().optional().describe("Alias of key — prefer key"),
        controlField: z.string().optional().describe("The exact returned controlField.value, including an explicit empty value"),
      }).refine((value) => Boolean(value.key?.trim() || value.runnerKey?.trim()), { message: "key (or runnerKey) is required" }),
      execute: async ({ key, runnerKey, controlField }) => {
        const resolvedKey = (key ?? runnerKey ?? "").trim();
        if (!resolvedKey) {
          return formatToolResultForAgent("qkrpc_step_runner_get", { key, runnerKey, controlField },
            formatLocalToolResult({ error: "key (or runnerKey) is required" }, false, "key (or runnerKey) is required"));
        }
        const args = ["step-runner", "get", "--key", resolvedKey];
        if (controlField !== undefined) args.push("--control-field", controlField);
        return formatToolResultForAgent("qkrpc_step_runner_get", { key: resolvedKey, controlField },
          await run(args, { timeoutMs: 180_000 }));
      },
    }),
  };
}

export const stepRunnerKnowledgeTools = createStepRunnerKnowledgeTools();
