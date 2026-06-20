import { relative } from "node:path";
import type { WorkspaceInstructions } from "@/lib/agent-defs/types";
import { WORKSPACE_AGENTS_MD } from "@/lib/agent-defs/paths";

/** Excerpt injected into system prompt when full rules are not preloaded. */
export const WORKSPACE_RULES_SUMMARY_CHARS = 2_048;

/** When AGENTS.md exceeds this size, inject the Quick routing section even if truncated from excerpt. */
export const WORKSPACE_RULES_LARGE_CHARS = 4_096;

const QUICK_ROUTING_HEADING = /^##\s+Quick routing[^\n]*/im;

/** Extract the Quick routing ## section from agents.md-style content. */
export function extractAgentsMdQuickRoutingSection(content: string): string | null {
  const match = QUICK_ROUTING_HEADING.exec(content);
  if (!match) return null;
  const start = match.index;
  const afterHeading = content.slice(start + match[0].length);
  const nextHeading = afterHeading.search(/\n## /);
  const body = nextHeading >= 0 ? afterHeading.slice(0, nextHeading) : afterHeading;
  return `${match[0]}${body}`.trimEnd();
}

function routingAlreadyInExcerpt(excerpt: string, routing: string): boolean {
  const sample = routing.slice(0, Math.min(120, routing.length)).trim();
  return sample.length > 0 && excerpt.includes(sample);
}

/** When true, inject full AGENTS.md body (legacy). Default: path + summary excerpt. */
export function isWorkspaceRulesFullInPromptEnabled(): boolean {
  const raw = process.env.HARNESS_WORKSPACE_RULES_FULL?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return false;
}

function relativeRulePath(filePath: string, cwd?: string): string {
  const trimmed = cwd?.trim();
  if (!trimmed) {
    return filePath.includes(WORKSPACE_AGENTS_MD)
      ? WORKSPACE_AGENTS_MD
      : filePath.replace(/\\/g, "/").split("/").slice(-2).join("/");
  }
  try {
    return relative(trimmed, filePath).replace(/\\/g, "/") || WORKSPACE_AGENTS_MD;
  } catch {
    return WORKSPACE_AGENTS_MD;
  }
}

export function formatWorkspaceInstructionsFullBlock(
  instructions: WorkspaceInstructions,
): string {
  const lines = ["## Workspace instructions", ""];
  if (instructions.truncated) {
    lines.push(
      `_(truncated load from ${relativeRulePath(instructions.filePath)} — use Read for full file)_`,
      "",
    );
  }
  lines.push(instructions.content);
  return lines.join("\n");
}

export function formatWorkspaceInstructionsCompactBlock(
  instructions: WorkspaceInstructions,
  cwd?: string,
): string {
  const relPath = relativeRulePath(instructions.filePath, cwd);
  const excerpt = instructions.content.slice(0, WORKSPACE_RULES_SUMMARY_CHARS);
  const hasMore =
    instructions.content.length > excerpt.length || instructions.truncated;
  const quickRouting =
    instructions.content.length >= WORKSPACE_RULES_LARGE_CHARS
      ? extractAgentsMdQuickRoutingSection(instructions.content)
      : null;
  const showQuickRouting =
    quickRouting != null && !routingAlreadyInExcerpt(excerpt, quickRouting);

  const lines = [
    "## Workspace rules (index)",
    `- Path: \`${relPath}\` (Read for full AGENTS.md when build/routing details matter)`,
    `- Loaded: ${instructions.content.length} chars${instructions.truncated ? "+" : ""}`,
    "",
  ];

  if (showQuickRouting) {
    lines.push("### Quick routing", quickRouting, "");
  }

  lines.push("### Summary excerpt", excerpt.trimEnd() || "_(empty)_");

  if (hasMore) {
    lines.push(
      "",
      `_(excerpt ${Math.min(excerpt.length, instructions.content.length)} chars — Read \`${relPath}\` for remainder)_`,
    );
  }

  return lines.join("\n");
}

export function formatWorkspaceInstructionsForPrompt(
  instructions: WorkspaceInstructions,
  options?: { cwd?: string; full?: boolean },
): string {
  const full = options?.full ?? isWorkspaceRulesFullInPromptEnabled();
  return full
    ? formatWorkspaceInstructionsFullBlock(instructions)
    : formatWorkspaceInstructionsCompactBlock(instructions, options?.cwd);
}
