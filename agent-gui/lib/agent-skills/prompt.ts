import "server-only";

import { discoverAgentSkills } from "@/lib/agent-skills/discover";
import { loadSkillInstructions } from "@/lib/agent-skills/load";
import {
  PRELOADED_SKILL_NAMES,
  PRELOADED_SKILL_SCOPES,
} from "@/lib/agent-skills/paths";

/** agentskills.io tier 1 — name + description catalog for on-demand skills. */
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
    "## Available skills (on demand)",
    "Match task to description; workflows via docs get, references/ via docs search when needed.",
    "",
    "<available_skills>",
  ];
  for (const skill of onDemand) {
    lines.push(
      `<skill>`,
      `<name>${skill.name}</name>`,
      `<description>${skill.description}</description>`,
      `</skill>`,
    );
  }
  lines.push("</available_skills>");
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
