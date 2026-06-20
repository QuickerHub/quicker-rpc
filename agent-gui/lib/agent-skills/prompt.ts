import "server-only";

import { discoverAgentSkills } from "@/lib/agent-skills/discover";
import { loadSkillInstructions } from "@/lib/agent-skills/load";
import {
  PRELOADED_SKILL_NAMES,
  PRELOADED_SKILL_SCOPES,
} from "@/lib/agent-skills/paths";

export {
  formatPreloadedSkillsCatalogForPrompt,
  formatPreloadedSkillsEssentialsForPrompt,
  isPreloadedSkillBodyInPromptEnabled,
} from "@/lib/agent-skills/prompt-catalog";

const SKILL_CATALOG_DESC_MAX = 72;

/** agentskills.io tier 1 — compact name + description catalog for on-demand skills. */
export async function formatSkillCatalogForPrompt(): Promise<string> {
  const skills = await discoverAgentSkills();
  const onDemand = skills.filter(
    (s) =>
      !PRELOADED_SKILL_NAMES.some(
        (n) => n.toLowerCase() === s.name.toLowerCase(),
      ),
  );
  if (onDemand.length === 0) return "";

  const lines = [
    "## On-demand skills",
    "Match task → name; load via docs search/get or Read `.cursor/skills/<name>/SKILL.md`.",
    "",
  ];
  for (const skill of onDemand) {
    const desc = skill.description?.trim() ?? "";
    const short =
      desc.length > SKILL_CATALOG_DESC_MAX
        ? `${desc.slice(0, SKILL_CATALOG_DESC_MAX - 1)}…`
        : desc;
    lines.push(`- \`${skill.name}\`: ${short}`);
  }
  return lines.join("\n");
}

/** agentskills.io tier 2 — preloaded skill instructions at session start. */
export async function formatPreloadedSkillBlock(
  skillName: string,
  options?: { topicIndex?: string; suffix?: string },
): Promise<string> {
  const loaded = await loadSkillInstructions(skillName);
  if (!loaded?.body) return "";

  const title = loaded.name.replace(/-/g, " ");
  const scope =
    PRELOADED_SKILL_SCOPES[loaded.name]
    ?? "see instructions below. Workflows: docs get; references/: docs search when stuck.";
  const lines = [`## Skill: ${title}`, `Scope: ${scope}`, "", loaded.body];
  if (options?.topicIndex) {
    lines.push("", options.topicIndex);
  }
  if (options?.suffix) {
    lines.push("", options.suffix);
  }
  return lines.join("\n");
}

export async function formatAllPreloadedSkillsForPrompt(
  extras?: Record<string, { topicIndex?: string; suffix?: string }>,
): Promise<string> {
  const parts: string[] = [];
  for (const name of PRELOADED_SKILL_NAMES) {
    const block = await formatPreloadedSkillBlock(name, extras?.[name]);
    if (block) parts.push(block);
  }
  return parts.join("\n\n");
}
