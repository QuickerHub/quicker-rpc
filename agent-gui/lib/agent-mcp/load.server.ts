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
import { readMcpToolCatalog, type McpServerCatalog } from "./catalog";
import { nativeQuickerMcpFailure, resolveQuickerNativeMcpSource, NativeQuickerMcpError, type NativeQuickerMcpSource, type NativeQuickerSourceDependencies } from "./native-quicker-source.server";

const nativeSources = new WeakMap<MCPClient, NativeQuickerMcpSource>();
export function nativeMcpClientIdentity(client: MCPClient): string | undefined { return nativeSources.get(client)?.identity; }
export function nativeMcpClientFailure(client: MCPClient | undefined, error: unknown) {
  return nativeQuickerMcpFailure(client && nativeSources.get(client)?.failure() || error);
}

export type LoadedAgentMcpTools = {
  tools: ToolSet;
  callPolicyOverrides: Record<string, Partial<ToolCallPolicy>>;
  diagnostics: AgentMcpConfigDiagnostic[];
  /** Permitted raw protocol definitions for this turn, without executable closures. */
  catalogs: McpServerCatalog[];
  dispose: () => Promise<void>;
};

export async function connectAgentMcpServer(
  server: AgentMcpServerConfig,
  workspaceCwd: string,
  owner: McpClientOwner,
  nativeDependencies?: NativeQuickerSourceDependencies,
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

  const native = server.source === "quicker-native" ? await resolveQuickerNativeMcpSource(abortSignal, nativeDependencies) : undefined;
  try {
    const client = await awaitMcpConnection(createMCPClient({
      clientName: `quicker-agent:${server.name}`,
      transport: {
        type: server.transport,
        url: native?.url ?? server.url!,
        headers: native ? undefined : expandMcpStringRecord(server.headers),
        fetch: createMcpTransportFetch({ abortSignal: signal, fetch: native?.fetch }),
      },
    }), { ...connectionOptions, onAbandon: () => connection.abort() });
    if (native) {
      nativeSources.set(client, native);
      try {
        await native.assertCurrent(true, abortSignal);
        native.assertPublicData({ serverInfo: client.serverInfo, instructions: client.instructions });
        if ((typeof client.serverInfo?.name === "string" && client.serverInfo.name.length > 256)
          || (typeof client.serverInfo?.version === "string" && client.serverInfo.version.length > 128)) throw new Error("Invalid native server identity");
        const listTools = client.listTools.bind(client);
        client.listTools = async (...args) => {
          const result = await listTools(...args);
          await native.assertCurrent(true, abortSignal);
          native.assertPublicData(result);
          return result;
        };
      } catch (error) {
        await (await owner.register(client))();
        throw error;
      }
    }
    return client;
  } catch (error) {
    abortSignal.throwIfAborted();
    if (native) throw native.failure() ?? new Error(nativeQuickerMcpFailure(error).message);
    throw error;
  }
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
  dependencies: {
    loadConfig?: typeof loadAgentMcpConfig;
    connectServer?: typeof connectAgentMcpServer;
    readCatalog?: typeof readMcpToolCatalog;
  } = {},
): Promise<LoadedAgentMcpTools> {
  const owner = createMcpClientOwner({ abortSignal: options.abortSignal });
  const { signal } = owner;
  try {
    signal.throwIfAborted();
    const config = await (dependencies.loadConfig ?? loadAgentMcpConfig)(cwd);
    signal.throwIfAborted();
    const tools: ToolSet = {};
    const callPolicyOverrides: Record<string, Partial<ToolCallPolicy>> = {};
    const diagnostics = [...config.diagnostics];
    const catalogs: McpServerCatalog[] = [];

    for (const server of config.servers) {
      if (!server.enabled) continue;
      let closeClient: (() => Promise<void>) | undefined;
      let client: MCPClient | undefined;
      try {
        signal.throwIfAborted();
        client = await (dependencies.connectServer ?? connectAgentMcpServer)(server, cwd, owner);
        closeClient = await owner.register(client);
        signal.throwIfAborted();
        const catalog = await (dependencies.readCatalog ?? readMcpToolCatalog)(client, {
          serverName: server.name, configPath: server.configPath, transport: server.transport, workspaceCwd: cwd,
        }, { abortSignal: signal });
        signal.throwIfAborted();
        const permitted = selectMcpToolDefinitions(catalog.tools, {
          mode: options.chatMode,
          allowedTools: server.tools,
        });
        const mapped = client.toolsFromDefinitions({
          tools: structuredClone(permitted),
        });
        signal.throwIfAborted();
        const names = Object.keys(mapped), expected = new Set(permitted.map((tool) => tool.name));
        if (names.length !== permitted.length || names.some((name) => !expected.has(name))) {
          throw new Error("MCP SDK mapped tool names do not match permitted definitions");
        }
        const exposed = exposeServerTools(server, mapped);
        if (server.source === "quicker-native") {
          for (const definition of Object.values(exposed)) {
            const execute = definition.execute;
            if (execute) definition.execute = async (...args) => {
              const source = client ? nativeSources.get(client) : undefined;
              const dispatchedBefore = source?.toolDispatchCount() ?? 0;
              try {
                const result = await execute(...args);
                await source?.assertCurrent(true, signal); source?.assertPublicData(result);
                return result;
              }
              catch (error) {
                signal.throwIfAborted();
                const failure = source?.failure();
                const sent = (source?.toolDispatchCount() ?? 0) > dispatchedBefore;
                // HTTP success does not establish a tool result: decoding or body streaming can still fail.
                // Concurrent protocol requests share the client; another request's 401/403 cannot
                // prove that this already-dispatched tool did not execute.
                if (sent) throw new NativeQuickerMcpError(failure?.code === "source_changed" ? "source_changed" : "error", true);
                throw new Error(nativeMcpClientFailure(client, error).message);
              }
            };
          }
        }
        signal.throwIfAborted();
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
        catalogs.push({ ...catalog, tools: permitted });
      } catch (error) {
        await closeClient?.().catch(() => {});
        signal.throwIfAborted();
        diagnostics.push({
          path: server.configPath,
          message: server.source === "quicker-native" ? nativeMcpClientFailure(client, error).message
            : `MCP server "${server.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    return {
      tools,
      callPolicyOverrides,
      diagnostics,
      catalogs,
      dispose: owner.dispose,
    };
  } catch (error) {
    await owner.dispose();
    throw error;
  }
}
