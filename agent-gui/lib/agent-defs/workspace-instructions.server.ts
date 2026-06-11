import { readFile, stat } from "node:fs/promises";
import {
  MAX_WORKSPACE_INSTRUCTIONS_CHARS,
  resolveWorkspaceInstructionsPaths,
} from "@/lib/agent-defs/paths";
import type { WorkspaceInstructions } from "@/lib/agent-defs/types";

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

export function formatWorkspaceInstructionsBlock(
  instructions: WorkspaceInstructions,
): string {
  const lines = ["## Workspace instructions", ""];
  if (instructions.truncated) {
    lines.push(
      `_(truncated to ${MAX_WORKSPACE_INSTRUCTIONS_CHARS} chars from ${instructions.filePath})_`,
      "",
    );
  }
  lines.push(instructions.content);
  return lines.join("\n");
}

export function formatSubagentsCatalogBlock(
  agents: Array<{ name: string; description: string }>,
): string {
  if (agents.length === 0) return "";
  const lines = [
    "## Subagents",
    "Delegate focused work via the `task` tool. Pick by name + description.",
    "",
    "<available_subagents>",
  ];
  for (const agent of agents) {
    lines.push(
      `<subagent>`,
      `<name>${agent.name}</name>`,
      `<description>${agent.description}</description>`,
      `</subagent>`,
    );
  }
  lines.push("</available_subagents>");
  return lines.join("\n");
}
