import type { ListToolsResult } from "@ai-sdk/mcp";
import { mcpToolId } from "./config";

export const MCP_CATALOG_LIMITS = {
  maxPages: 64,
  maxTools: 2048,
  maxBytes: 4 * 1024 * 1024,
  timeoutMs: 15_000,
} as const;

export type McpToolDescriptor = ListToolsResult["tools"][number];
export type McpCatalogSource = {
  serverName: string;
  configPath: string;
  transport: "http" | "sse" | "stdio";
  workspaceCwd: string;
};
/** Turn-local data only: never retain a client's executable tool closures here. */
export type McpServerCatalog = {
  source: McpCatalogSource;
  /** Reported server software identity; this is not a tool-catalog revision. */
  serverInfo: { name: string | null; version: string | null };
  pageCount: number;
  tools: McpToolDescriptor[];
};
export type McpCatalogClient = {
  readonly serverInfo?: unknown;
  listTools: (options: {
    params?: { cursor: string };
    options: { signal: AbortSignal };
  }) => Promise<ListToolsResult>;
};

function serverInfo(value: unknown): McpServerCatalog["serverInfo"] {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
  return { name: text(row.name), version: text(row.version) };
}

/** All pages form one result; cancellation or any invalid page discards the entire listing. */
export async function readMcpToolCatalog(
  client: McpCatalogClient,
  source: McpCatalogSource,
  options: { abortSignal?: AbortSignal; limits?: Partial<Record<keyof typeof MCP_CATALOG_LIMITS, number>> } = {},
): Promise<McpServerCatalog> {
  const limits = { ...MCP_CATALOG_LIMITS, ...options.limits };
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid MCP catalog resource limit");
  }
  options.abortSignal?.throwIfAborted();
  const controller = new AbortController();
  const signal = options.abortSignal ? AbortSignal.any([options.abortSignal, controller.signal]) : controller.signal;
  const info = serverInfo(client.serverInfo);
  const timer = setTimeout(() => controller.abort(new Error(`MCP tool listing timed out after ${limits.timeoutMs}ms`)), limits.timeoutMs);
  let onAbort: (() => void) | undefined;
  try {
    const listing = async (): Promise<McpServerCatalog> => {
      const tools: McpToolDescriptor[] = [];
      const names = new Set<string>(), ids = new Set<string>(), cursors = new Set<string>();
      let cursor: string | undefined, bytes = 0;
      for (let pageCount = 1; pageCount <= limits.maxPages; pageCount++) {
        signal.throwIfAborted();
        const page = await client.listTools({ ...(cursor === undefined ? {} : { params: { cursor } }), options: { signal } });
        signal.throwIfAborted();
        if (JSON.stringify(serverInfo(client.serverInfo)) !== JSON.stringify(info)) throw new Error("MCP server identity changed during tool listing");
        if (!page || !Array.isArray(page.tools) || (page.nextCursor !== undefined && typeof page.nextCursor !== "string")) {
          throw new Error("Invalid MCP tool listing page");
        }
        if (tools.length + page.tools.length > limits.maxTools) throw new Error(`MCP tool listing exceeds ${limits.maxTools} tools`);
        // Pick protocol data explicitly, so future SDK executable fields cannot enter the catalog.
        const descriptors = page.tools.map((tool) => {
          if (!tool || typeof tool.name !== "string" || !tool.name.trim()
            || !tool.inputSchema || typeof tool.inputSchema !== "object" || Array.isArray(tool.inputSchema)) {
            throw new Error("Invalid MCP tool descriptor");
          }
          if (names.has(tool.name)) throw new Error(`Duplicate MCP tool name: ${tool.name}`);
          const id = mcpToolId(source.serverName, tool.name);
          if (ids.has(id)) throw new Error(`MCP tool id collision after normalization: ${id}`);
          names.add(tool.name); ids.add(id);
          return Object.fromEntries(["name", "title", "description", "inputSchema", "outputSchema", "annotations", "_meta"]
            .filter((key) => Object.hasOwn(tool, key)).map((key) => [key, (tool as unknown as Record<string, unknown>)[key]]));
        });
        const serialized = JSON.stringify({ tools: descriptors, nextCursor: page.nextCursor });
        bytes += Buffer.byteLength(serialized, "utf8");
        if (bytes > limits.maxBytes) throw new Error(`MCP tool listing exceeds ${limits.maxBytes} bytes`);
        tools.push(...(JSON.parse(serialized) as ListToolsResult).tools);
        if (page.nextCursor === undefined) return { source: { ...source }, serverInfo: info, pageCount, tools };
        if (cursors.has(page.nextCursor)) throw new Error("MCP tool listing cursor repeated");
        cursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      throw new Error(`MCP tool listing exceeds ${limits.maxPages} pages`);
    };
    return await Promise.race([listing(), new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    })]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
