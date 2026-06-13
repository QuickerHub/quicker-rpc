import { Agent } from "@cursor/sdk";
import type { AgentOptions } from "@cursor/sdk";
import { quickerRpcAgentOptions } from "./config.js";

export async function createQuickerRpcAgent(
  overrides: Partial<AgentOptions> = {},
) {
  return Agent.create(quickerRpcAgentOptions(overrides));
}
