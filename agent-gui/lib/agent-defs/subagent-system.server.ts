import "server-only";

import type { SubagentDef, SubagentInherit } from "@/lib/agent-defs/types";
import {
  formatWorkspaceInstructionsForPrompt,
  loadWorkspaceInstructions,
} from "@/lib/agent-defs/workspace-instructions.server";
import {
  formatPreloadedSkillsEssentialsForPrompt,
  isPreloadedSkillBodyInPromptEnabled,
} from "@/lib/agent-skills/prompt-catalog";

function wantsInherit(inherit: SubagentInherit[], token: SubagentInherit): boolean {
  return inherit.includes("all") || inherit.includes(token);
}

/** Build isolated subagent system prompt with optional inherited context blocks. */
export async function buildSubagentSystemPrompt(
  subagent: SubagentDef,
  cwd: string,
): Promise<string> {
  const parts = [subagent.body.trim() || subagent.description];

  if (wantsInherit(subagent.inherit, "skills")) {
    const skillBlock = isPreloadedSkillBodyInPromptEnabled()
      ? await (
          await import("@/lib/action-authoring-docs")
        ).formatAuthoringSkillForPrompt()
      : await formatPreloadedSkillsEssentialsForPrompt(cwd);
    if (skillBlock) {
      parts.push("", skillBlock);
    }
  }

  if (wantsInherit(subagent.inherit, "workspace") && cwd) {
    const workspaceInstructions = await loadWorkspaceInstructions(cwd);
    if (workspaceInstructions) {
      parts.push(
        "",
        formatWorkspaceInstructionsForPrompt(workspaceInstructions, { cwd }),
      );
    }
  }

  if (cwd) {
    parts.push(
      "",
      "## cwd",
      `qkrpc cwd: ${cwd}`,
      `Scratch/temp path: \`${cwd}/.local/\` (create as needed; gitignored).`,
    );
  }

  return parts.join("\n");
}
