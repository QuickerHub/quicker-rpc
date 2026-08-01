import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

import {
  resolveUserAgentDefsRoot,
  resolveWorkspaceAgentDefsRoot,
} from "@/lib/agent-defs/paths";

const callLimitSchema = z.number().int().min(1).max(100).optional();

const mcpServerSchema = z
  .object({
    enabled: z.boolean().default(false),
    transport: z.enum(["http", "sse", "stdio"]),
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
    if (server.transport === "stdio" && !server.command) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["command"],
        message: "stdio transport requires command",
      });
    }
    if (server.transport !== "stdio" && !server.url) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: `${server.transport} transport requires url`,
      });
    }
  });

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

export function resolveAgentMcpConfigPaths(cwd: string): string[] {
  const paths = [join(resolveUserAgentDefsRoot(), "mcp.json")];
  if (cwd.trim()) {
    paths.push(join(resolveWorkspaceAgentDefsRoot(cwd), "mcp.json"));
  }
  return paths;
}

async function readConfigFile(path: string): Promise<{
  servers: AgentMcpServerConfig[];
  diagnostics: AgentMcpConfigDiagnostic[];
}> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT"
      ? { servers: [], diagnostics: [] }
      : { servers: [], diagnostics: [{ path, message: String(error) }] };
  }

  return parseAgentMcpConfigText(raw, path);
}

export function parseAgentMcpConfigText(
  raw: string,
  path = "mcp.json",
): {
  servers: AgentMcpServerConfig[];
  diagnostics: AgentMcpConfigDiagnostic[];
} {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return {
      servers: [],
      diagnostics: [{ path, message: `Invalid JSON: ${String(error)}` }],
    };
  }

  const parsed = mcpConfigSchema.safeParse(json);
  if (!parsed.success) {
    return {
      servers: [],
      diagnostics: parsed.error.issues.map((issue) => ({
        path,
        message: `${issue.path.join(".") || "config"}: ${issue.message}`,
      })),
    };
  }

  const servers: AgentMcpServerConfig[] = [];
  const diagnostics: AgentMcpConfigDiagnostic[] = [];
  for (const [name, rawServer] of Object.entries(parsed.data.mcpServers)) {
    const server = mcpServerSchema.safeParse(rawServer);
    if (!server.success) {
      diagnostics.push(...server.error.issues.map((issue) => ({
        path,
        message: `mcpServers.${name}.${issue.path.join(".") || "config"}: ${issue.message}`,
      })));
      continue;
    }
    servers.push({
      ...server.data,
      name,
      configPath: path,
      baseDir: dirname(path),
      cwd: server.data.cwd
        ? resolve(dirname(path), server.data.cwd)
        : undefined,
    });
  }
  return { servers, diagnostics };
}

/** Merge user then workspace config; the workspace definition wins by server name. */
export async function loadAgentMcpConfig(cwd: string): Promise<ResolvedAgentMcpConfig> {
  const byName = new Map<string, AgentMcpServerConfig>();
  const diagnostics: AgentMcpConfigDiagnostic[] = [];
  for (const path of resolveAgentMcpConfigPaths(cwd)) {
    const layer = await readConfigFile(path);
    diagnostics.push(...layer.diagnostics);
    for (const server of layer.servers) {
      byName.set(server.name.toLowerCase(), server);
    }
  }
  return {
    servers: [...byName.values()].filter((server) => server.enabled),
    diagnostics,
  };
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

export function mcpToolId(serverName: string, toolName: string): string {
  const normalize = (value: string) =>
    value.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return `mcp__${normalize(serverName) || "server"}__${normalize(toolName) || "tool"}`;
}
