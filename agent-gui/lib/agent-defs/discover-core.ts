import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  parseCommandDef,
  parseSkillRecordFromMd,
  parseSubagentDef,
} from "@/lib/agent-defs/parse";
import {
  resolveAgentsDir,
  resolveBundledSkillsRoot,
  resolveCommandsDir,
  resolveSkillsDir,
  resolveUserAgentDefsRoot,
  resolveWorkspaceAgentDefsRoot,
} from "@/lib/agent-defs/paths";
import type {
  AgentCommandDef,
  AgentDefDiagnostic,
  AgentDefScope,
  AgentDefsCatalog,
  SubagentDef,
} from "@/lib/agent-defs/types";
import { AGENT_DEF_SCOPE_ORDER } from "@/lib/agent-defs/types";

type CacheEntry = {
  cwd: string;
  mtimeMs: number;
  catalog: AgentDefsCatalog;
};

let cached: CacheEntry | null = null;

async function dirMtimeMs(dir: string): Promise<number> {
  let max = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    try {
      const st = await stat(p);
      max = Math.max(max, st.mtimeMs);
      if (ent.isDirectory()) {
        max = Math.max(max, await dirMtimeMs(p));
      }
    } catch {
      // ignore
    }
  }
  return max;
}

async function computeDiscoveryMtime(cwd: string): Promise<number> {
  const roots = [
    resolveWorkspaceAgentDefsRoot(cwd),
    resolveUserAgentDefsRoot(),
    resolveBundledSkillsRoot(),
  ];
  let max = 0;
  for (const root of roots) {
    max = Math.max(max, await dirMtimeMs(root));
  }
  return max;
}

async function readMdFiles(dir: string): Promise<Array<{ path: string; raw: string }>> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: Array<{ path: string; raw: string }> = [];
  for (const ent of entries) {
    if (!ent.isFile() || !ent.name.toLowerCase().endsWith(".md")) continue;
    const path = join(dir, ent.name);
    try {
      files.push({ path, raw: await readFile(path, "utf8") });
    } catch {
      // skip unreadable
    }
  }
  return files;
}

async function discoverCommandsInRoot(
  root: string,
  scope: AgentDefScope,
): Promise<AgentCommandDef[]> {
  const files = await readMdFiles(resolveCommandsDir(root));
  const records: AgentCommandDef[] = [];
  for (const file of files) {
    const record = parseCommandDef(file.path, file.raw, scope);
    if (record) records.push(record);
  }
  return records;
}

async function discoverAgentsInRoot(
  root: string,
  scope: AgentDefScope,
): Promise<SubagentDef[]> {
  const files = await readMdFiles(resolveAgentsDir(root));
  const records: SubagentDef[] = [];
  for (const file of files) {
    const record = parseSubagentDef(file.path, file.raw, scope);
    if (record) records.push(record);
  }
  return records;
}

async function discoverSkillsInRoot(
  root: string,
  scope: AgentDefScope,
  options?: { skillsDir?: string },
): Promise<AgentDefsCatalog["skills"]> {
  const skillsDir = options?.skillsDir ?? resolveSkillsDir(root);
  let entries;
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const records: AgentDefsCatalog["skills"] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const skillDir = join(skillsDir, ent.name);
    const skillMdPath = join(skillDir, "SKILL.md");
    let raw: string;
    try {
      raw = await readFile(skillMdPath, "utf8");
    } catch {
      continue;
    }
    const record = parseSkillRecordFromMd(
      skillDir,
      ent.name,
      skillMdPath,
      raw,
      scope,
    );
    if (record) records.push(record);
  }
  return records;
}

function mergeByName<T extends { name: string; scope: AgentDefScope }>(
  layers: Array<{ scope: AgentDefScope; items: T[] }>,
  diagnostics: AgentDefDiagnostic[],
  kind: string,
): T[] {
  const byKey = new Map<string, T>();
  for (const layer of layers) {
    for (const item of layer.items) {
      const key = item.name.toLowerCase();
      const existing = byKey.get(key);
      if (existing) {
        const existingRank = AGENT_DEF_SCOPE_ORDER.indexOf(existing.scope);
        const layerRank = AGENT_DEF_SCOPE_ORDER.indexOf(layer.scope);
        if (layerRank < existingRank) {
          diagnostics.push({
            level: "warning",
            message: `${kind} "${item.name}" from ${layer.scope} overrides ${existing.scope}`,
          });
          byKey.set(key, item);
        }
        continue;
      }
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export async function discoverAgentDefs(cwd = ""): Promise<AgentDefsCatalog> {
  const normalizedCwd = cwd.trim();
  const mtime = await computeDiscoveryMtime(normalizedCwd);
  if (
    cached
    && cached.cwd === normalizedCwd
    && cached.mtimeMs === mtime
  ) {
    return cached.catalog;
  }

  const diagnostics: AgentDefDiagnostic[] = [];
  const workspaceRoot = normalizedCwd
    ? resolveWorkspaceAgentDefsRoot(normalizedCwd)
    : "";
  const userRoot = resolveUserAgentDefsRoot();
  const bundledRoot = resolveBundledSkillsRoot();

  const commandLayers: Array<{ scope: AgentDefScope; items: AgentCommandDef[] }> = [];
  const agentLayers: Array<{ scope: AgentDefScope; items: SubagentDef[] }> = [];
  const skillLayers: Array<{
    scope: AgentDefScope;
    items: AgentDefsCatalog["skills"];
  }> = [];

  if (workspaceRoot) {
    commandLayers.push({
      scope: "workspace",
      items: await discoverCommandsInRoot(workspaceRoot, "workspace"),
    });
    agentLayers.push({
      scope: "workspace",
      items: await discoverAgentsInRoot(workspaceRoot, "workspace"),
    });
    skillLayers.push({
      scope: "workspace",
      items: await discoverSkillsInRoot(workspaceRoot, "workspace"),
    });
  }

  commandLayers.push({
    scope: "user",
    items: await discoverCommandsInRoot(userRoot, "user"),
  });
  agentLayers.push({
    scope: "user",
    items: await discoverAgentsInRoot(userRoot, "user"),
  });
  skillLayers.push({
    scope: "user",
    items: await discoverSkillsInRoot(userRoot, "user"),
  });

  skillLayers.push({
    scope: "bundled",
    items: await discoverSkillsInRoot(bundledRoot, "bundled", {
      skillsDir: bundledRoot,
    }),
  });

  const catalog: AgentDefsCatalog = {
    commands: mergeByName(commandLayers, diagnostics, "command"),
    agents: mergeByName(agentLayers, diagnostics, "subagent"),
    skills: mergeByName(skillLayers, diagnostics, "skill"),
    diagnostics,
  };

  cached = { cwd: normalizedCwd, mtimeMs: mtime, catalog };
  return catalog;
}

export async function getAgentCommand(
  name: string,
  cwd = "",
): Promise<AgentCommandDef | null> {
  const key = name.trim().toLowerCase();
  const catalog = await discoverAgentDefs(cwd);
  return catalog.commands.find((c) => c.name.toLowerCase() === key) ?? null;
}

export async function getSubagent(
  name: string,
  cwd = "",
): Promise<SubagentDef | null> {
  const key = name.trim().toLowerCase();
  const catalog = await discoverAgentDefs(cwd);
  return catalog.agents.find((a) => a.name.toLowerCase() === key) ?? null;
}

export function resetAgentDefsCache(): void {
  cached = null;
}
