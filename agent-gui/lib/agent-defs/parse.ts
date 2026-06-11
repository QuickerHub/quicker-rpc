import { basename } from "node:path";
import {
  extractMetadataFields,
  parseFrontmatterMd,
  parseToolList,
} from "@/lib/agent-defs/frontmatter";
import type {
  AgentCommandDef,
  AgentDefScope,
  SubagentDef,
} from "@/lib/agent-defs/types";

function fileStem(filePath: string): string {
  const base = basename(filePath);
  return base.replace(/\.md$/i, "");
}

export function parseCommandDef(
  filePath: string,
  raw: string,
  scope: AgentDefScope,
): AgentCommandDef | null {
  const { fields, body } = parseFrontmatterMd(raw);
  const description = fields.description?.trim() ?? "";
  if (!description) return null;

  const name = fileStem(filePath);
  const warnings: string[] = [];
  const frontName = fields.name?.trim();
  if (frontName && frontName !== name) {
    warnings.push(`frontmatter name "${frontName}" differs from file name "${name}"`);
  }

  return {
    name,
    description,
    argumentHint: fields["argument-hint"]?.trim() || null,
    allowedTools: parseToolList(fields["allowed-tools"]),
    model: fields.model?.trim() || null,
    body: body.trim(),
    filePath,
    scope,
    warnings,
  };
}

export function parseSubagentDef(
  filePath: string,
  raw: string,
  scope: AgentDefScope,
): SubagentDef | null {
  const { fields, body } = parseFrontmatterMd(raw);
  const description = fields.description?.trim() ?? "";
  if (!description) return null;

  const stem = fileStem(filePath);
  const name = fields.name?.trim() || stem;
  const warnings: string[] = [];
  if (fields.name?.trim() && fields.name.trim() !== stem) {
    warnings.push(`frontmatter name "${fields.name.trim()}" differs from file name "${stem}"`);
  }

  return {
    name,
    description,
    tools: parseToolList(fields.tools),
    model: fields.model?.trim() || null,
    body: body.trim(),
    filePath,
    scope,
    warnings,
  };
}

export function parseSkillRecordFromMd(
  skillDir: string,
  dirName: string,
  skillMdPath: string,
  raw: string,
  scope: AgentDefScope,
): {
  name: string;
  description: string;
  skillDir: string;
  skillMdPath: string;
  allowedTools: string[];
  scope: AgentDefScope;
  warnings: string[];
} | null {
  const { fields } = parseFrontmatterMd(raw);
  const metadata = extractMetadataFields(fields);
  const name = fields.name?.trim() || dirName;
  const description = fields.description?.trim() ?? "";
  if (!description) return null;

  const warnings: string[] = [];
  if (fields.name?.trim() && fields.name.trim() !== dirName) {
    warnings.push(`frontmatter name "${fields.name.trim()}" differs from directory "${dirName}"`);
  }
  if (metadata.layer) {
    // metadata preserved for future use
  }

  return {
    name,
    description,
    skillDir,
    skillMdPath,
    allowedTools: parseToolList(fields["allowed-tools"]),
    scope,
    warnings,
  };
}
