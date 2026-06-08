import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { validateSkillName } from "@/lib/agent-skills/validate";
import type { AgentSkillRecord } from "@/lib/agent-skills/types";
import { parseSkillMd } from "@/lib/skill-parse";
import {
  resolveSkillsRoot,
  skillMdExists,
} from "@/lib/agent-skills/paths";

let cachedSkills: AgentSkillRecord[] | null = null;
let cachedRoot = "";
let cachedMtimeMs = 0;

async function skillsRootMtimeMs(root: string): Promise<number> {
  let max = 0;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const skillMd = join(root, ent.name, "SKILL.md");
    try {
      max = Math.max(max, (await stat(skillMd)).mtimeMs);
    } catch {
      // not a skill directory
    }
  }
  return max;
}

async function parseSkillRecord(
  skillDir: string,
  dirName: string,
): Promise<AgentSkillRecord | null> {
  const skillMdPath = join(skillDir, "SKILL.md");
  let raw: string;
  try {
    raw = await readFile(skillMdPath, "utf8");
  } catch {
    return null;
  }

  const parsed = parseSkillMd(raw);
  const name = parsed.name.trim() || dirName;
  const description = parsed.description.trim();
  if (!description) {
    return null;
  }

  const warnings = validateSkillName(name, dirName);

  return {
    name,
    description,
    skillDir,
    skillMdPath,
    allowedTools: parsed.allowedTools,
    compatibility: parsed.compatibility,
    metadata: parsed.metadata,
    dirName,
    warnings,
  };
}

/** Discover all skills under docs/skills (agentskills.io tier 1 catalog). */
export async function discoverAgentSkills(): Promise<AgentSkillRecord[]> {
  const root = resolveSkillsRoot();
  const mtime = await skillsRootMtimeMs(root);
  if (cachedSkills && cachedRoot === root && cachedMtimeMs === mtime) {
    return cachedSkills;
  }

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    cachedSkills = [];
    cachedRoot = root;
    cachedMtimeMs = mtime;
    return [];
  }

  const records: AgentSkillRecord[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const skillDir = join(root, ent.name);
    if (!skillMdExists(skillDir)) continue;
    const record = await parseSkillRecord(skillDir, ent.name);
    if (record) records.push(record);
  }

  records.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  cachedSkills = records;
  cachedRoot = root;
  cachedMtimeMs = mtime;
  return records;
}

export async function getAgentSkill(
  name: string,
): Promise<AgentSkillRecord | null> {
  const key = name.trim().toLowerCase();
  const skills = await discoverAgentSkills();
  return skills.find((s) => s.name.toLowerCase() === key) ?? null;
}

/** Clear discovery cache (tests). */
export function resetAgentSkillsCache(): void {
  cachedSkills = null;
  cachedRoot = "";
  cachedMtimeMs = 0;
}
