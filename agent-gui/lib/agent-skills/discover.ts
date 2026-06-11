import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  discoverAgentDefs,
  resetAgentDefsCache,
} from "@/lib/agent-defs/discover-core";
import { getRequestCwd } from "@/lib/qkrpc-request-context";
import { validateSkillName } from "@/lib/agent-skills/validate";
import type { AgentSkillRecord } from "@/lib/agent-skills/types";
import { parseSkillMd } from "@/lib/skill-parse";

async function skillRecordFromPath(
  skillDir: string,
  skillMdPath: string,
  scope: AgentSkillRecord["scope"],
): Promise<AgentSkillRecord | null> {
  const dirName = basename(skillDir);
  let raw: string;
  try {
    raw = await readFile(skillMdPath, "utf8");
  } catch {
    return null;
  }

  const parsed = parseSkillMd(raw);
  const name = parsed.name.trim() || dirName;
  const description = parsed.description.trim();
  if (!description) return null;

  const warnings = [
    ...validateSkillName(name, dirName),
  ];

  return {
    name,
    description,
    skillDir,
    skillMdPath,
    allowedTools: parsed.allowedTools,
    compatibility: parsed.compatibility,
    metadata: parsed.metadata,
    dirName,
    scope,
    warnings,
  };
}

/** Discover skills: workspace .quicker > user agent-defs > bundled docs/skills. */
export async function discoverAgentSkills(
  cwd?: string,
): Promise<AgentSkillRecord[]> {
  const resolvedCwd = (cwd ?? getRequestCwd() ?? "").trim();
  const catalog = await discoverAgentDefs(resolvedCwd);

  const records: AgentSkillRecord[] = [];
  for (const row of catalog.skills) {
    const record = await skillRecordFromPath(
      row.skillDir,
      row.skillMdPath,
      row.scope,
    );
    if (record) {
      records.push({
        ...record,
        warnings: [...record.warnings, ...row.warnings],
      });
    }
  }

  records.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  return records;
}

export async function getAgentSkill(
  name: string,
  cwd?: string,
): Promise<AgentSkillRecord | null> {
  const key = name.trim().toLowerCase();
  const skills = await discoverAgentSkills(cwd);
  return skills.find((s) => s.name.toLowerCase() === key) ?? null;
}

/** Clear discovery cache (tests). */
export function resetAgentSkillsCache(): void {
  resetAgentDefsCache();
}
