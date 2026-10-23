import "server-only";

import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { Tool, ToolSet } from "ai";
import type { ChatMode } from "@/lib/chat-mode";

import type { ToolCallPolicy } from "@/lib/agent-tool-policy";
import {
  expandMcpStringRecord,
  loadAgentMcpConfig,
  mcpToolId,
  type AgentMcpConfigDiagnostic,
  type AgentMcpServerConfig,
} from "@/lib/agent-mcp/config";
import { applyModelFacingToolOutputToToolMap } from "@/lib/tool-model-output";
import { selectMcpToolDefinitions } from "@/lib/agent-mcp/tool-capabilities";
import { awaitMcpConnection } from "./connect-timeout";
import { createMcpClientOwner, type McpClientOwner } from "./client-owner";
import { createMcpTransportFetch } from "./transport-fetch";

export type LoadedAgentMcpTools = {
  tools: ToolSet;
  callPolicyOverrides: Record<string, Partial<ToolCallPolicy>>;
  diagnostics: AgentMcpConfigDiagnostic[];
  dispose: () => Promise<void>;
};

async function connectServer(
  server: AgentMcpServerConfig,
  workspaceCwd: string,
  owner: McpClientOwner,
): Promise<MCPClient> {
  const abortSignal = owner.signal;
  abortSignal.throwIfAborted();
  const connection = new AbortController();
  const signal = AbortSignal.any([abortSignal, connection.signal]);
  const connectionOptions = {
    serverName: server.name,
    abortSignal,
    closeLateClient: async (client: MCPClient) => { await (await owner.register(client))(); },
  };
  if (server.transport === "stdio") {
    const transport = new Experimental_StdioMCPTransport({
      command: server.command!, args: server.args,
      env: expandMcpStringRecord(server.env), cwd: server.cwd ?? workspaceCwd, stderr: "pipe",
    });
    const rawClose = transport.close.bind(transport);
    let transportClosing: Promise<void> | undefined;
    transport.close = () => transportClosing ??= Promise.resolve().then(rawClose);
    // Own the transport before initialization yields a client, so a stalled handshake can be stopped.
    const closeTransport = await owner.register(transport);
    abortSignal.throwIfAborted();
    return awaitMcpConnection(createMCPClient({
      clientName: `quicker-agent:${server.name}`,
      transport,
    }), { ...connectionOptions, onAbandon: closeTransport });
  }

  return awaitMcpConnection(createMCPClient({
    clientName: `quicker-agent:${server.name}`,
    transport: {
      type: server.transport,
      url: server.url!,
      headers: expandMcpStringRecord(server.headers),
      fetch: createMcpTransportFetch({ abortSignal: signal }),
    },
  }), { ...connectionOptions, onAbandon: () => connection.abort() });
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
export async function loadConfiguredMcpTools(
  cwd: string,
  options: { chatMode: ChatMode; abortSignal?: AbortSignal } = { chatMode: "agent" },
): Promise<LoadedAgentMcpTools> {
  const owner = createMcpClientOwner({ abortSignal: options.abortSignal });
  const { signal } = owner;
  try {
    signal.throwIfAborted();
    const config = await loadAgentMcpConfig(cwd);
    signal.throwIfAborted();
    const tools: ToolSet = {};
    const callPolicyOverrides: Record<string, Partial<ToolCallPolicy>> = {};
    const diagnostics = [...config.diagnostics];

    for (const server of config.servers) {
      let closeClient: (() => Promise<void>) | undefined;
      try {
        signal.throwIfAborted();
        const client = await connectServer(server, cwd, owner);
        closeClient = await owner.register(client);
        signal.throwIfAborted();
        const definitions = await client.listTools({ options: { signal } });
        signal.throwIfAborted();
        const permitted = selectMcpToolDefinitions(definitions.tools, {
          mode: options.chatMode,
          allowedTools: server.tools,
        });
        const exposed = exposeServerTools(server, client.toolsFromDefinitions({
          ...definitions,
          tools: permitted,
        }));
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
      } catch (error) {
        await closeClient?.().catch(() => {});
        signal.throwIfAborted();
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
      dispose: owner.dispose,
    };
  } catch (error) {
    await owner.dispose();
    throw error;
  }
}
