import { readFile } from "node:fs/promises";
import { createHmac, randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
export { mcpToolId } from "./tool-id";

import {
  resolveUserAgentDefsRoot,
  resolveWorkspaceAgentDefsRoot,
} from "@/lib/agent-defs/paths";

const callLimitSchema = z.number().int().min(1).max(100).optional();
export const QUICKER_NATIVE_MCP_SERVER_NAME = "quicker-local";
const revisionKey = randomBytes(32);

const mcpServerSchema = z
  .object({
    source: z.literal("quicker-native").optional(),
    enabled: z.boolean().default(false),
    transport: z.enum(["http", "sse", "stdio"]).optional(),
    url: z.string().url().optional(),
    headers: z.record(z.string()).optional(),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    cwd: z.string().optional(),
    tools: z.array(z.string().min(1)).optional(),
    requireApproval: z.boolean().default(false),
    maxCallsPerTurn: callLimitSchema,
    maxIdenticalCallsPerTurn: callLimitSchema,
  })
  .superRefine((server, context) => {
    if (server.source === "quicker-native") {
      for (const key of ["transport", "url", "headers", "command", "args", "env", "cwd"] as const) {
        if (server[key] !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "Native Quicker connection does not accept transport overrides" });
      }
      return;
    }
    if (!server.transport) context.addIssue({ code: z.ZodIssueCode.custom, path: ["transport"], message: "transport is required" });
    if (server.transport === "stdio" && !server.command) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["command"],
        message: "stdio transport requires command",
      });
    }
    if (server.transport && server.transport !== "stdio" && !server.url) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: `${server.transport} transport requires url`,
      });
    }
  }).transform((server) => ({ ...server, transport: server.source === "quicker-native" ? "http" as const : server.transport! }));

const mcpConfigSchema = z.object({
  mcpServers: z.record(z.unknown()).default({}),
});

export type AgentMcpServerConfig = z.infer<typeof mcpServerSchema> & {
  name: string;
  configPath: string;
  baseDir: string;
};

export type AgentMcpConfigDiagnostic = {
  path: string;
  message: string;
};

export type ResolvedAgentMcpConfig = {
  servers: AgentMcpServerConfig[];
  diagnostics: AgentMcpConfigDiagnostic[];
};

export type AgentMcpConfigLayer = {
  path: string;
  revision: string | null;
  status: "missing" | "valid" | "invalid" | "unavailable";
  /** Invalid explicit entries still shadow a lower-priority server of the same name. */
  entries: Array<{ name: string; server: AgentMcpServerConfig | null }>;
  diagnostics: AgentMcpConfigDiagnostic[];
};

export function resolveAgentMcpConfigPaths(cwd: string): string[] {
  const paths = [join(resolveUserAgentDefsRoot(), "mcp.json")];
  if (cwd.trim()) {
    paths.push(join(resolveWorkspaceAgentDefsRoot(cwd), "mcp.json"));
  }
  return paths;
}

async function readConfigFile(path: string): Promise<AgentMcpConfigLayer> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT"
      ? { path, revision: null, status: "missing", entries: [], diagnostics: [] }
      : { path, revision: null, status: "unavailable", entries: [], diagnostics: [{ path, message: "MCP configuration could not be read" }] };
  }
  const parsed = parseAgentMcpConfigText(bytes.toString("utf8"), path);
  return { path, revision: createHmac("sha256", revisionKey).update(path).update("\0").update(bytes).digest("hex"), status: parsed.status, entries: parsed.entries, diagnostics: parsed.diagnostics };
}

export function parseAgentMcpConfigText(
  raw: string,
  path = "mcp.json",
): {
  servers: AgentMcpServerConfig[];
  diagnostics: AgentMcpConfigDiagnostic[];
  entries: AgentMcpConfigLayer["entries"];
  status: "valid" | "invalid";
} {
  let json: unknown;
  try {
    json = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    return {
      servers: [],
      entries: [], status: "invalid",
      diagnostics: [{ path, message: "Invalid MCP configuration JSON" }],
    };
  }

  const parsed = mcpConfigSchema.safeParse(json);
  if (!parsed.success) {
    return {
      servers: [],
      entries: [], status: "invalid",
      diagnostics: parsed.error.issues.map((issue) => ({
        path,
        message: `${issue.path.join(".") || "config"}: ${issue.message}`,
      })),
    };
  }

  const servers: AgentMcpServerConfig[] = [];
  const diagnostics: AgentMcpConfigDiagnostic[] = [];
  const entries: AgentMcpConfigLayer["entries"] = [];
  for (const [name, rawServer] of Object.entries(parsed.data.mcpServers)) {
    const server = mcpServerSchema.safeParse(rawServer);
    const wrongNativeName = server.success && server.data.source === "quicker-native" && name.toLowerCase() !== QUICKER_NATIVE_MCP_SERVER_NAME;
    const unknownNativeField = server.success && server.data.source === "quicker-native" && Object.keys(rawServer as object)
      .some((key) => !["enabled", "source", "tools", "requireApproval", "maxCallsPerTurn", "maxIdenticalCallsPerTurn"].includes(key));
    if (!server.success || wrongNativeName || unknownNativeField) {
      entries.push({ name, server: null });
      diagnostics.push({ path, message: !server.success && server.error.issues.some((issue) => issue.message === "stdio transport requires command")
        ? "stdio transport requires command" : "MCP server entry is invalid" });
      continue;
    }
    const resolved: AgentMcpServerConfig = {
      ...server.data,
      name: server.data.source === "quicker-native" ? QUICKER_NATIVE_MCP_SERVER_NAME : name,
      configPath: path,
      baseDir: dirname(path),
      cwd: server.data.cwd
        ? resolve(dirname(path), server.data.cwd)
        : undefined,
    };
    servers.push(resolved);
    entries.push({ name, server: resolved });
  }
  return { servers, diagnostics, entries, status: "valid" };
}

export async function loadAgentMcpConfigLayers(cwd: string, paths = resolveAgentMcpConfigPaths(cwd)): Promise<AgentMcpConfigLayer[]> {
  return Promise.all(paths.map(readConfigFile));
}

export function mergeAgentMcpConfigLayers(layers: AgentMcpConfigLayer[]): ResolvedAgentMcpConfig {
  const byName = new Map<string, AgentMcpServerConfig>();
  const diagnostics: AgentMcpConfigDiagnostic[] = [];
  for (const layer of layers) {
    diagnostics.push(...layer.diagnostics);
    if (layer.status === "invalid" || layer.status === "unavailable") byName.clear();
    for (const entry of layer.entries) {
      byName.delete(entry.name.toLowerCase());
      if (entry.server) byName.set(entry.name.toLowerCase(), entry.server);
    }
  }
  return { servers: [...byName.values()].filter((server) => server.enabled), diagnostics };
}

/** Merge user then workspace config; the workspace definition wins by server name. */
export async function loadAgentMcpConfig(cwd: string): Promise<ResolvedAgentMcpConfig> {
  return mergeAgentMcpConfigLayers(await loadAgentMcpConfigLayers(cwd));
}

const ENV_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function expandMcpEnvironmentValue(value: string): string {
  return value.replace(ENV_REFERENCE, (_match, name: string) => {
    const resolved = process.env[name];
    if (resolved === undefined) {
      throw new Error(`Environment variable ${name} is not defined`);
    }
    return resolved;
  });
}

export function expandMcpStringRecord(
  values: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!values) return undefined;
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, expandMcpEnvironmentValue(value)]),
  );
}
