import "server-only";

import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { Tool, ToolSet } from "ai";

import type { ToolCallPolicy } from "@/lib/agent-tool-policy";
import {
  expandMcpStringRecord,
  loadAgentMcpConfig,
  mcpToolId,
  type AgentMcpConfigDiagnostic,
  type AgentMcpServerConfig,
} from "@/lib/agent-mcp/config";
import { applyModelFacingToolOutputToToolMap } from "@/lib/tool-model-output";

export type LoadedAgentMcpTools = {
  tools: ToolSet;
  callPolicyOverrides: Record<string, Partial<ToolCallPolicy>>;
  diagnostics: AgentMcpConfigDiagnostic[];
  dispose: () => Promise<void>;
};

async function withMcpConnectTimeout(
  pending: Promise<MCPClient>,
  serverName: string,
): Promise<MCPClient> {
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const connected = pending.then(async (client) => {
    if (timedOut) {
      await client.close().catch(() => {});
      throw new Error(`MCP server "${serverName}" connected after timeout`);
    }
    return client;
  });
  try {
    return await Promise.race([
      connected,
      new Promise<MCPClient>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          reject(new Error(`MCP server "${serverName}" initialization timed out after 15000ms`));
        }, 15_000);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function connectServer(
  server: AgentMcpServerConfig,
  workspaceCwd: string,
): Promise<MCPClient> {
  if (server.transport === "stdio") {
    return withMcpConnectTimeout(createMCPClient({
      clientName: `quicker-agent:${server.name}`,
      transport: new Experimental_StdioMCPTransport({
        command: server.command!,
        args: server.args,
        env: expandMcpStringRecord(server.env),
        cwd: server.cwd ?? workspaceCwd,
        stderr: "pipe",
      }),
    }), server.name);
  }

  return withMcpConnectTimeout(createMCPClient({
    clientName: `quicker-agent:${server.name}`,
    transport: {
      type: server.transport,
      url: server.url!,
      headers: expandMcpStringRecord(server.headers),
    },
  }), server.name);
}

function exposeServerTools(
  server: AgentMcpServerConfig,
  remoteTools: ToolSet,
): ToolSet {
  const allowed = server.tools ? new Set(server.tools) : null;
  const exposed: ToolSet = {};
  for (const [remoteName, definition] of Object.entries(remoteTools)) {
    if (allowed && !allowed.has(remoteName)) continue;
    const id = mcpToolId(server.name, remoteName);
    if (exposed[id]) {
      throw new Error(`MCP tool id collision after normalization: ${id}`);
    }
    const toolDefinition = definition as Tool;
    exposed[id] = {
      ...toolDefinition,
      description: `[MCP:${server.name}] ${toolDefinition.description ?? remoteName}`,
      needsApproval: server.requireApproval
        ? true
        : toolDefinition.needsApproval,
    } as Tool;
  }
  return applyModelFacingToolOutputToToolMap(exposed);
}

/** Connect enabled MCP servers for one turn and return namespaced AI SDK tools. */
export async function loadConfiguredMcpTools(cwd: string): Promise<LoadedAgentMcpTools> {
  const config = await loadAgentMcpConfig(cwd);
  const clients: MCPClient[] = [];
  const tools: ToolSet = {};
  const callPolicyOverrides: Record<string, Partial<ToolCallPolicy>> = {};
  const diagnostics = [...config.diagnostics];

  for (const server of config.servers) {
    let client: MCPClient | undefined;
    try {
      client = await connectServer(server, cwd);
      const exposed = exposeServerTools(server, await client.tools());
      for (const toolId of Object.keys(exposed)) {
        if (tools[toolId]) {
          throw new Error(`MCP tool id collision: ${toolId}`);
        }
      }
      for (const [toolId, definition] of Object.entries(exposed)) {
        tools[toolId] = definition;
        callPolicyOverrides[toolId] = {
          maxCallsPerTurn: server.maxCallsPerTurn,
          maxIdenticalCallsPerTurn: server.maxIdenticalCallsPerTurn,
        };
      }
      clients.push(client);
    } catch (error) {
      if (client) await client.close().catch(() => {});
      diagnostics.push({
        path: server.configPath,
        message: `MCP server "${server.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    tools,
    callPolicyOverrides,
    diagnostics,
    dispose: async () => {
      await Promise.allSettled(clients.map((client) => client.close()));
    },
  };
}
