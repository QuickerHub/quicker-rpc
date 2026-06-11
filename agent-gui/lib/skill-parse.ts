import {
  extractMetadataFields,
  parseFrontmatterMd,
  parseToolList,
} from "@/lib/agent-defs/frontmatter";

export type ParsedSkill = {
  name: string;
  description: string;
  allowedTools: string[];
  compatibility: string | null;
  metadata: Record<string, string>;
  body: string;
};

/** Parse Agent Skills SKILL.md (YAML frontmatter + Markdown body). */
export function parseSkillMd(content: string): ParsedSkill {
  const { fields, body } = parseFrontmatterMd(content);
  const metadata = extractMetadataFields(fields);

  return {
    name: fields.name?.trim() ?? "",
    description: fields.description?.trim() ?? "",
    allowedTools: parseToolList(fields["allowed-tools"]),
    compatibility: fields.compatibility?.trim() || null,
    metadata,
    body,
  };
}
