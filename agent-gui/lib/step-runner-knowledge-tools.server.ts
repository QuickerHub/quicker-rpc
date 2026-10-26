import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { formatQkrpcResultForAgent, runQkrpcForTool } from "./qkrpc";
import { incrementStepRunnerSearchCountThisTurn } from "./program-turn-context";
import { formatLocalToolResult } from "./tool-result";
import { formatToolResultForAgent } from "./tool-result-agent-view";
import { runQkrpcSchemaReadForTool } from "./qkrpc-schema-read.server";

type KnowledgeRunner = (args: string[], options: { timeoutMs: number }) => Promise<Record<string, unknown>>;

const nativeRunner: KnowledgeRunner = async (args, options) =>
  formatQkrpcResultForAgent(await (args.includes("--schema-read") ? runQkrpcSchemaReadForTool(args, options) : runQkrpcForTool(args, options)));

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
        + "If the result is incomplete, use read:{pointer:'',mode:'children'} to find exact paths, then mode:'value' for raw JSON text fragments. Follow nextRead exactly; each page freshly verifies the observation. "
        + "read requires an existing host binding and cannot start, discover or repair a host. Missing knowledge stays unknown and pages do not grant editing permission. "
        + "Write short wire key/inputs/outputs (never stepKey). "
        + "Var bind: \"paramKey.var\":\"varKey\"; interpolation: $$…{varKey}…; file: paramKey.file. NOT get-ui.",
      inputSchema: z.object({
        key: z.string().optional().describe("items[].key from qkrpc_step_runner_search"),
        runnerKey: z.string().optional().describe("Alias of key — prefer key"),
        controlField: z.string().optional().describe("The exact returned controlField.value, including an explicit empty value"),
        read: z.object({
          pointer: z.string().optional().describe("JSON Pointer into Agent schema body, excluding attached knowledge; empty means root"),
          mode: z.enum(["children", "value"]).optional().describe("children lists direct paths; value pages the selected node's JSON text"),
          offset: z.number().int().min(0).max(2147483647).optional().describe("Use nextRead; children counts entries, value counts UTF-16 units"),
          expectedObservation: z.string().optional().describe("Copy the current page observation; required for offset > 0"),
        }).strict().optional(),
      }).refine((value) => Boolean(value.key?.trim() || value.runnerKey?.trim()), { message: "key (or runnerKey) is required" }),
      execute: async ({ key, runnerKey, controlField, read }) => {
        const resolvedKey = (key ?? runnerKey ?? "").trim();
        if (!resolvedKey) {
          return formatToolResultForAgent("qkrpc_step_runner_get", { key, runnerKey, controlField },
            formatLocalToolResult({ error: "key (or runnerKey) is required" }, false, "key (or runnerKey) is required"));
        }
        const args = ["step-runner", "get", "--key", resolvedKey];
        if (controlField !== undefined) args.push(read ? "--control-field-json" : "--control-field", read ? JSON.stringify(controlField) : controlField);
        if (read) args.push("--schema-read", JSON.stringify(read));
        return formatToolResultForAgent("qkrpc_step_runner_get", { key: resolvedKey, controlField, ...(read ? { read } : {}) },
          await run(args, { timeoutMs: 180_000 }));
      },
    }),
  };
}

export const stepRunnerKnowledgeTools = createStepRunnerKnowledgeTools();
