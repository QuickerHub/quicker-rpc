import "server-only";
import type { MCPClient } from "@ai-sdk/mcp";
import { QUICKER_NATIVE_MCP_SERVER_NAME } from "./config";
import { createMcpClientOwner } from "./client-owner";
import { readMcpToolCatalog } from "./catalog";
import { connectAgentMcpServer, nativeMcpClientFailure, nativeMcpClientIdentity } from "./load.server";
import type { NativeQuickerSourceDependencies, NativeMcpFailureCode } from "./native-quicker-source.server";

export type QuickerNativeMcpProbe = {
  status: "ok" | NativeMcpFailureCode;
  sourceIdentity?: string;
  serverInfo?: { name: string | null; version: string | null };
  toolCount?: number;
  instructionsStatus?: "available" | "missing" | "omitted";
  checkedAt: string;
  message?: string;
};

/** One explicitly requested native connection; never loads configured servers or executes a tool. */
export async function probeQuickerNativeMcp(signal?: AbortSignal, nativeDependencies?: NativeQuickerSourceDependencies): Promise<QuickerNativeMcpProbe> {
  const owner = createMcpClientOwner({ abortSignal: signal });
  let client: MCPClient | undefined;
  try {
    owner.signal.throwIfAborted();
    client = await connectAgentMcpServer({ name: QUICKER_NATIVE_MCP_SERVER_NAME, source: "quicker-native", enabled: true,
      transport: "http", requireApproval: false, configPath: "quicker-native", baseDir: "" }, "", owner, nativeDependencies);
    await owner.register(client);
    owner.signal.throwIfAborted();
    const catalog = await readMcpToolCatalog(client, { serverName: QUICKER_NATIVE_MCP_SERVER_NAME, configPath: "quicker-native",
      transport: "http", workspaceCwd: "" }, { abortSignal: owner.signal });
    owner.signal.throwIfAborted();
    const guidance = (catalog as typeof catalog & { guidance?: { state: "available" | "missing" | "omitted" } }).guidance;
    return { status: "ok", sourceIdentity: nativeMcpClientIdentity(client), serverInfo: catalog.serverInfo,
      toolCount: catalog.tools.length, instructionsStatus: guidance?.state ?? "missing", checkedAt: new Date().toISOString() };
  } catch (error) {
    signal?.throwIfAborted();
    return { ...nativeMcpClientFailure(client, error), sourceIdentity: client ? nativeMcpClientIdentity(client) : undefined, checkedAt: new Date().toISOString() };
  } finally { await owner.dispose(); }
}
