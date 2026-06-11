export type {
  AgentCommandDef,
  AgentDefDiagnostic,
  AgentDefScope,
  AgentDefsCatalog,
  SubagentDef,
  WorkspaceInstructions,
} from "@/lib/agent-defs/types";

export {
  AGENT_DEF_SCOPE_ORDER,
  commandFrontmatterSchema,
  subagentFrontmatterSchema,
} from "@/lib/agent-defs/types";

export {
  parseFrontmatterMd,
  parseToolList,
  extractMetadataFields,
} from "@/lib/agent-defs/frontmatter";
export type { ParsedFrontmatter } from "@/lib/agent-defs/frontmatter";

export {
  QUICKER_AGENT_DEFS_DIR,
  WORKSPACE_AGENTS_MD,
  MAX_WORKSPACE_INSTRUCTIONS_CHARS,
  resolveUserAgentDefsRoot,
  resolveWorkspaceAgentDefsRoot,
  resolveBundledSkillsRoot,
  resolveWorkspaceInstructionsPaths,
} from "@/lib/agent-defs/paths";

export {
  parseCommandDef,
  parseSubagentDef,
  parseSkillRecordFromMd,
} from "@/lib/agent-defs/parse";

export {
  discoverAgentDefs,
  getAgentCommand,
  getSubagent,
  resetAgentDefsCache,
} from "@/lib/agent-defs/discover.server";

export {
  loadWorkspaceInstructions,
  formatWorkspaceInstructionsBlock,
  formatSubagentsCatalogBlock,
} from "@/lib/agent-defs/workspace-instructions.server";

export {
  parseSlashCommandInput,
  expandCommandPlaceholders,
  expandSlashCommand,
  wrapExpandedCommandForModel,
} from "@/lib/agent-defs/command-expand";
export type { ExpandedSlashCommand } from "@/lib/agent-defs/command-expand";
