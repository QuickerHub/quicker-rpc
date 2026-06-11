import { z } from "zod";

/** Definition source scope; higher precedence wins on name collision. */
export type AgentDefScope = "workspace" | "user" | "bundled";

export const AGENT_DEF_SCOPE_ORDER: AgentDefScope[] = [
  "workspace",
  "user",
  "bundled",
];

export type AgentDefDiagnostic = {
  level: "warning" | "error";
  message: string;
  path?: string;
};

export type AgentCommandDef = {
  name: string;
  description: string;
  argumentHint: string | null;
  allowedTools: string[];
  model: string | null;
  body: string;
  filePath: string;
  scope: AgentDefScope;
  warnings: string[];
};

export type SubagentDef = {
  name: string;
  description: string;
  tools: string[];
  model: string | null;
  body: string;
  filePath: string;
  scope: AgentDefScope;
  warnings: string[];
};

export type WorkspaceInstructions = {
  content: string;
  filePath: string;
  truncated: boolean;
};

export type AgentDefsCatalog = {
  commands: AgentCommandDef[];
  agents: SubagentDef[];
  skills: Array<{
    name: string;
    description: string;
    scope: AgentDefScope;
    skillDir: string;
    skillMdPath: string;
    allowedTools: string[];
    warnings: string[];
  }>;
  diagnostics: AgentDefDiagnostic[];
};

export const commandFrontmatterSchema = z.object({
  description: z.string().min(1),
  "argument-hint": z.string().optional(),
  "allowed-tools": z.string().optional(),
  model: z.string().optional(),
});

export const subagentFrontmatterSchema = z.object({
  name: z.string().optional(),
  description: z.string().min(1),
  tools: z.string().optional(),
  model: z.string().optional(),
});
