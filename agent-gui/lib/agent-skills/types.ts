import type { AgentDefScope } from "@/lib/agent-defs/types";
import type { ParsedSkill } from "@/lib/skill-parse";

/** Discovered skill record (agentskills.io tier 1 metadata). */
export type AgentSkillRecord = {
  name: string;
  description: string;
  skillDir: string;
  skillMdPath: string;
  allowedTools: string[];
  compatibility: string | null;
  metadata: Record<string, string>;
  /** Parent directory name when it differs from frontmatter name (warn only). */
  dirName: string;
  scope: AgentDefScope;
  warnings: string[];
};

export type LoadedAgentSkill = AgentSkillRecord & {
  parsed: ParsedSkill;
  body: string;
};

/** Topic row from skill extension manifest (topics.json). */
export type SkillTopicEntry = {
  topic: string;
  title: string;
  description: string;
  layer?: string;
  charCount?: number;
  references?: { id: string; title: string }[];
  markdown?: string;
  reference?: string;
};

export type SkillTopicsManifest = {
  skillName: string;
  topics: Array<{
    topic: string;
    title?: string;
    description: string;
    layer?: string;
    metadata?: Record<string, string>;
  }>;
  referenceFiles?: Record<string, string>;
  referenceCatalog?: Record<
    string,
    Array<{ id: string; title: string; path?: string }>
  >;
};
