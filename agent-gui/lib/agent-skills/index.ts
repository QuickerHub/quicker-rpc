export type {
  AgentSkillRecord,
  LoadedAgentSkill,
  SkillTopicEntry,
  SkillTopicsManifest,
} from "@/lib/agent-skills/types";

export {
  DEFAULT_SKILLS_REL,
  PRELOADED_SKILL_NAMES,
  PRELOADED_SKILL_SCOPES,
  SKILL_TIER2_BODY_FILES,
  resolveSkillDir,
  resolveSkillsRoot,
  skillMdExists,
} from "@/lib/agent-skills/paths";

export {
  discoverAgentSkills,
  getAgentSkill,
  resetAgentSkillsCache,
} from "@/lib/agent-skills/discover";

export {
  compactSkillBody,
  loadSkillInstructions,
  resetSkillBodyCache,
} from "@/lib/agent-skills/load";

export { loadTopicsManifest } from "@/lib/agent-skills/topics-manifest";

export {
  formatAllPreloadedSkillsForPrompt,
  formatPreloadedSkillBlock,
  formatSkillCatalogForPrompt,
} from "@/lib/agent-skills/prompt";

export { validateSkillName } from "@/lib/agent-skills/validate";

export { parseSkillMd } from "@/lib/skill-parse";
export type { ParsedSkill } from "@/lib/skill-parse";
