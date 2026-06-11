import { getAgentCommand } from "@/lib/agent-defs/discover-core";
import type { AgentCommandDef } from "@/lib/agent-defs/types";

const SLASH_COMMAND_RE = /^\/([a-z][\w-]*)(?:\s+([\s\S]*))?$/i;

export type ExpandedSlashCommand = {
  command: AgentCommandDef;
  arguments: string;
  expandedBody: string;
  modelOverride: string | null;
  allowedTools: string[];
};

export function expandCommandPlaceholders(
  template: string,
  args: string,
): string {
  const parts = args.trim() ? args.trim().split(/\s+/) : [];
  let result = template;
  result = result.replace(/\$ARGUMENTS/g, args.trim());
  for (let i = 0; i < 9; i += 1) {
    const token = parts[i] ?? "";
    result = result.replace(new RegExp(`\\$${i + 1}\\b`, "g"), token);
  }
  return result;
}

export function parseSlashCommandInput(
  text: string,
): { name: string; arguments: string } | null {
  const trimmed = text.trim();
  const match = SLASH_COMMAND_RE.exec(trimmed);
  if (!match) return null;
  return {
    name: match[1],
    arguments: match[2]?.trim() ?? "",
  };
}

export async function expandSlashCommand(
  text: string,
  cwd = "",
): Promise<ExpandedSlashCommand | null> {
  const parsed = parseSlashCommandInput(text);
  if (!parsed) return null;

  const command = await getAgentCommand(parsed.name, cwd);
  if (!command) return null;

  const expandedBody = expandCommandPlaceholders(
    command.body || command.description,
    parsed.arguments,
  );

  return {
    command,
    arguments: parsed.arguments,
    expandedBody,
    modelOverride: command.model,
    allowedTools: command.allowedTools,
  };
}

export function wrapExpandedCommandForModel(
  expanded: ExpandedSlashCommand,
): string {
  const lines = [
    `<command-message name="${expanded.command.name}">`,
    expanded.expandedBody,
    `</command-message>`,
  ];
  if (expanded.arguments) {
    lines.push("", `User arguments: ${expanded.arguments}`);
  }
  return lines.join("\n");
}
