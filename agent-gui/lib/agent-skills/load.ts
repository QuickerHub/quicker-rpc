import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedAgentSkill } from "@/lib/agent-skills/types";
import { getAgentSkill } from "@/lib/agent-skills/discover";
import { SKILL_TIER2_BODY_FILES } from "@/lib/agent-skills/paths";
import { parseSkillMd } from "@/lib/skill-parse";

/** Collapse runs of blank lines (keeps single blank lines for GFM block boundaries). */
export function compactSkillBody(markdown: string): string {
  return markdown.replace(/\n{3,}/g, "\n\n").trimEnd();
}

async function readTier2Body(
  skillDir: string,
  skillName: string,
  skillMdRaw: string,
): Promise<string> {
  const overrideFile = SKILL_TIER2_BODY_FILES[skillName];
  if (overrideFile) {
    const overridePath = join(skillDir, overrideFile);
    try {
      const raw = await readFile(overridePath, "utf8");
      return compactSkillBody(raw);
    } catch {
      // fall through to SKILL.md body
    }
  }
  return compactSkillBody(parseSkillMd(skillMdRaw).body);
}

/** Read current tier-2 instructions; timestamps do not identify file content. */
export async function loadSkillInstructions(
  skillName: string,
  cwd?: string,
  _options?: { fresh?: boolean },
): Promise<LoadedAgentSkill | null> {
  const record = await getAgentSkill(skillName, cwd);
  if (!record) return null;

  const skillMdRaw = await readFile(record.skillMdPath, "utf8");
  const parsed = parseSkillMd(skillMdRaw);

  const body = await readTier2Body(record.skillDir, record.name, skillMdRaw);

  return { ...record, parsed, body };
}

export function resetSkillBodyCache(): void {
  // Compatibility hook: body reads no longer retain process-global results.
}
