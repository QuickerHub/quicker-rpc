import { readFile, stat } from "node:fs/promises";
import {
  MAX_WORKSPACE_INSTRUCTIONS_CHARS,
  resolveWorkspaceInstructionsPaths,
} from "@/lib/agent-defs/paths";
import type { WorkspaceInstructions } from "@/lib/agent-defs/types";
import { formatWorkspaceInstructionsForPrompt } from "@/lib/agent-defs/workspace-instructions-format";

export {
  formatWorkspaceInstructionsCompactBlock,
  formatWorkspaceInstructionsForPrompt,
  formatWorkspaceInstructionsFullBlock,
  isWorkspaceRulesFullInPromptEnabled,
  WORKSPACE_RULES_SUMMARY_CHARS,
} from "@/lib/agent-defs/workspace-instructions-format";

export async function loadWorkspaceInstructions(
  cwd: string,
): Promise<WorkspaceInstructions | null> {
  const paths = resolveWorkspaceInstructionsPaths(cwd);
  for (const filePath of paths) {
    try {
      await stat(filePath);
      const raw = await readFile(filePath, "utf8");
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const truncated = trimmed.length > MAX_WORKSPACE_INSTRUCTIONS_CHARS;
      return {
        content: truncated
          ? trimmed.slice(0, MAX_WORKSPACE_INSTRUCTIONS_CHARS)
          : trimmed,
        filePath,
        truncated,
      };
    } catch {
      // try next path
    }
  }
  return null;
}

/** @deprecated Use formatWorkspaceInstructionsForPrompt */
export function formatWorkspaceInstructionsBlock(
  instructions: WorkspaceInstructions,
): string {
  return formatWorkspaceInstructionsForPrompt(instructions);
}

export function formatSubagentsCatalogBlock(
  agents: Array<{
    name: string;
    description: string;
    inherit?: readonly string[];
  }>,
): string {
  if (agents.length === 0) return "";
  const lines = [
    "## Subagents",
    "Delegate focused work via the `task` tool. Pick by name + description.",
    "Optional frontmatter `inherit: skills workspace` merges parent skill/workspace context.",
    "",
    "<available_subagents>",
  ];
  for (const agent of agents) {
    const inheritHint = agent.inherit?.length
      ? ` (inherit: ${agent.inherit.join(", ")})`
      : "";
    lines.push(
      `<subagent>`,
      `<name>${agent.name}</name>`,
      `<description>${agent.description}${inheritHint}</description>`,
      `</subagent>`,
    );
  }
  lines.push("</available_subagents>");
  return lines.join("\n");
}
