import { readFile, stat } from "node:fs/promises";
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

const bodyCache = new Map<string, { mtimeMs: number; body: string }>();

/** Load tier-2 instructions (SKILL.md body or configured override). */
export async function loadSkillInstructions(
  skillName: string,
): Promise<LoadedAgentSkill | null> {
  const record = await getAgentSkill(skillName);
  if (!record) return null;

  const skillMdRaw = await readFile(record.skillMdPath, "utf8");
  const parsed = parseSkillMd(skillMdRaw);

  let bodyMtime = (await stat(record.skillMdPath)).mtimeMs;
  const overrideFile = SKILL_TIER2_BODY_FILES[record.name];
  if (overrideFile) {
    try {
      bodyMtime = Math.max(
        bodyMtime,
        (await stat(join(record.skillDir, overrideFile))).mtimeMs,
      );
    } catch {
      // ignore
    }
  }

  const cacheKey = record.skillMdPath;
  const cached = bodyCache.get(cacheKey);
  let body: string;
  if (cached && cached.mtimeMs === bodyMtime) {
    body = cached.body;
  } else {
    body = await readTier2Body(record.skillDir, record.name, skillMdRaw);
    bodyCache.set(cacheKey, { mtimeMs: bodyMtime, body });
  }

  return { ...record, parsed, body };
}

export function resetSkillBodyCache(): void {
  bodyCache.clear();
}
